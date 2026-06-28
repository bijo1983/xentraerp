app_name = "custom_erp"
app_title = "Custom ERP"
app_publisher = "Custom"
app_description = "Custom ERP API and Business Logic for React Frontend"
app_email = "admin@example.com"
app_license = "MIT"

# Website context for CORS (allow React frontend)
website_context = {
    "favicon": "/assets/custom_erp/images/favicon.ico",
}

# Allow guest access to login endpoint
guest_methods = ["custom_erp.api.auth.login"]

# CORS settings — configure allowed origins in site_config.json:
#   "allow_cors": ["http://localhost:3000", "https://your-frontend.com"]
