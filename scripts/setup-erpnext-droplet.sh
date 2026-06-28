#!/bin/bash
set -euo pipefail

#######################################################################
# ERPNext + Frappe — Fresh Install Script for Ubuntu 22.04 / 24.04
# Run as root on your DigitalOcean droplet.
#
# What this does:
#   1. Stops & removes any existing bench, MariaDB data, Redis, Node
#   2. Installs all prerequisites
#   3. Creates a 'frappe' system user
#   4. Installs Frappe Bench CLI
#   5. Initialises a new bench (version-15)
#   6. Installs ERPNext
#   7. Creates a site (you supply the site name & admin password)
#   8. Configures production mode (Supervisor + Nginx)
#
# Usage:
#   chmod +x setup-erpnext-droplet.sh
#   sudo ./setup-erpnext-droplet.sh
#######################################################################

# ── Configuration ────────────────────────────────────────────────────
FRAPPE_BRANCH="version-15"
ERPNEXT_BRANCH="version-15"
BENCH_DIR="/home/frappe/frappe-bench"
PYTHON_VERSION="3.11"
NODE_VERSION="18"
MARIADB_ROOT_PASS="your_mariadb_root_password_change_me"

# Prompt for site details
read -rp "Enter site name (e.g. erp.yourdomain.com): " SITE_NAME
read -rsp "Enter ERPNext admin password: " ADMIN_PASS
echo ""

echo "================================================================"
echo "  Phase 1: Cleanup existing installation"
echo "================================================================"

# Stop existing bench if running
if [ -d "$BENCH_DIR" ]; then
    echo ">> Stopping existing bench..."
    cd "$BENCH_DIR" && sudo bench disable-production 2>/dev/null || true
    supervisorctl stop all 2>/dev/null || true
    cd /root
    echo ">> Removing existing bench directory..."
    rm -rf "$BENCH_DIR"
fi

# Stop and purge MariaDB
echo ">> Purging MariaDB..."
systemctl stop mariadb 2>/dev/null || true
systemctl stop mysql 2>/dev/null || true
apt-get purge -y 'mariadb-*' 'mysql-*' 2>/dev/null || true
rm -rf /var/lib/mysql /etc/mysql /var/log/mysql

# Stop Redis
echo ">> Stopping Redis..."
systemctl stop redis-server 2>/dev/null || true

# Remove old supervisor/nginx configs
rm -f /etc/supervisor/conf.d/frappe-bench*.conf
rm -f /etc/nginx/conf.d/frappe-bench*.conf
rm -f /etc/nginx/sites-enabled/frappe-bench*
rm -f /etc/nginx/sites-available/frappe-bench*

echo ">> Cleanup complete."

echo "================================================================"
echo "  Phase 2: Install prerequisites"
echo "================================================================"

apt-get update -y
apt-get upgrade -y

# Essential packages
apt-get install -y \
    git \
    python3-dev \
    python3-pip \
    python3-venv \
    python3-setuptools \
    software-properties-common \
    build-essential \
    libffi-dev \
    libssl-dev \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    liblcms2-dev \
    libwebp-dev \
    libharfbuzz-dev \
    libpango1.0-dev \
    libxrender1 \
    xfonts-75dpi \
    xfonts-base \
    curl \
    wget \
    supervisor \
    nginx \
    cron \
    fail2ban

# ── Node.js ──────────────────────────────────────────────────────────
echo ">> Installing Node.js ${NODE_VERSION}..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
apt-get install -y nodejs
npm install -g yarn

# ── MariaDB ──────────────────────────────────────────────────────────
echo ">> Installing MariaDB 10.6..."
apt-get install -y mariadb-server mariadb-client libmariadb-dev

# Configure MariaDB for Frappe
cat > /etc/mysql/mariadb.conf.d/99-frappe.cnf <<MYCNF
[mysqld]
innodb-file-format=barracuda
innodb-file-per-table=1
innodb-large-prefix=1
character-set-client-handshake=FALSE
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
default-storage-engine=InnoDB
innodb_buffer_pool_size=2G
innodb_log_file_size=256M

[mysql]
default-character-set=utf8mb4
MYCNF

systemctl restart mariadb
systemctl enable mariadb

# Secure MariaDB — set root password
mysql -u root <<SQLEOF
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MARIADB_ROOT_PASS}';
FLUSH PRIVILEGES;
SQLEOF

echo ">> MariaDB configured."

# ── Redis ────────────────────────────────────────────────────────────
echo ">> Installing Redis..."
apt-get install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# ── wkhtmltopdf ─────────────────────────────────────────────────────
echo ">> Installing wkhtmltopdf..."
WKHTML_URL="https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.jammy_amd64.deb"
wget -q "$WKHTML_URL" -O /tmp/wkhtmltox.deb
dpkg -i /tmp/wkhtmltox.deb || apt-get install -f -y
rm /tmp/wkhtmltox.deb

echo "================================================================"
echo "  Phase 3: Create frappe user & install bench"
echo "================================================================"

# Create frappe user if not exists
if ! id "frappe" &>/dev/null; then
    useradd -m -s /bin/bash frappe
    usermod -aG sudo frappe
    echo "frappe ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/frappe
fi

# Install bench as frappe user
sudo -u frappe bash <<'BENCHEOF'
set -euo pipefail

cd /home/frappe
pip3 install --user frappe-bench

export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

echo ">> Initializing bench..."
bench init frappe-bench --frappe-branch version-15 --python python3

cd frappe-bench

echo ">> Getting ERPNext app..."
bench get-app erpnext --branch version-15

echo ">> Getting HRMS app..."
bench get-app hrms --branch version-15

BENCHEOF

echo "================================================================"
echo "  Phase 4: Create site & install ERPNext"
echo "================================================================"

sudo -u frappe bash <<SITEEOF
set -euo pipefail
export PATH="/home/frappe/.local/bin:\$PATH"
cd ${BENCH_DIR}

echo ">> Creating site: ${SITE_NAME}..."
bench new-site ${SITE_NAME} \
    --mariadb-root-password "${MARIADB_ROOT_PASS}" \
    --admin-password "${ADMIN_PASS}" \
    --install-app erpnext

bench --site ${SITE_NAME} install-app hrms

bench use ${SITE_NAME}

# Enable developer mode (for custom app development)
bench --site ${SITE_NAME} set-config developer_mode 1

# Set Redis cache and queue URLs
bench set-config -g redis_cache "redis://localhost:6379/0"
bench set-config -g redis_queue "redis://localhost:6379/1"
bench set-config -g redis_socketio "redis://localhost:6379/2"

echo ">> Site created and ERPNext installed."
SITEEOF

echo "================================================================"
echo "  Phase 5: Setup production (Supervisor + Nginx)"
echo "================================================================"

sudo -u frappe bash <<PRODEOF
set -euo pipefail
export PATH="/home/frappe/.local/bin:\$PATH"
cd ${BENCH_DIR}

# Setup production
sudo bench setup production frappe --yes

# Enable scheduler
bench --site ${SITE_NAME} enable-scheduler

PRODEOF

# Restart services
systemctl restart supervisor
systemctl restart nginx

echo "================================================================"
echo "  Phase 6: Setup Frappe custom app for React frontend API"
echo "================================================================"

sudo -u frappe bash <<APPEOF
set -euo pipefail
export PATH="/home/frappe/.local/bin:\$PATH"
cd ${BENCH_DIR}

# Create custom app for API endpoints
bench new-app custom_erp <<INPUTS
Custom ERP
Custom ERP API and Business Logic
MIT
INPUTS

bench --site ${SITE_NAME} install-app custom_erp

echo ">> Custom app 'custom_erp' created and installed."
APPEOF

echo ""
echo "================================================================"
echo "  ✅  Installation Complete!"
echo "================================================================"
echo ""
echo "  Site URL:       http://${SITE_NAME}"
echo "  Admin Login:    Administrator"
echo "  Admin Password: (the one you entered)"
echo ""
echo "  Bench directory: ${BENCH_DIR}"
echo "  Custom app:      ${BENCH_DIR}/apps/custom_erp"
echo ""
echo "  Useful commands:"
echo "    cd ${BENCH_DIR}"
echo "    bench start              # development mode"
echo "    bench restart             # production mode"
echo "    bench --site ${SITE_NAME} migrate"
echo "    bench --site ${SITE_NAME} console"
echo ""
echo "  Next steps:"
echo "    1. Point DNS for ${SITE_NAME} to this droplet's IP"
echo "    2. Run: bench setup lets-encrypt ${SITE_NAME}"
echo "    3. Deploy the React frontend (see frontend/ directory)"
echo ""
