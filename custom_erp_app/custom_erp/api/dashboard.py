import json
import frappe
from frappe.utils import nowdate, add_days, getdate


@frappe.whitelist()
def get_kpi_data():
    """Dashboard KPI data with Redis caching (5-minute TTL)."""
    cache_key = f"custom_erp:kpi:{frappe.session.user}"
    cached = frappe.cache().get_value(cache_key)
    if cached:
        return json.loads(cached)

    today = nowdate()
    thirty_days_ago = add_days(today, -30)

    total_revenue = frappe.db.sql(
        """SELECT COALESCE(SUM(grand_total), 0)
           FROM `tabSales Order`
           WHERE docstatus = 1 AND transaction_date >= %s""",
        thirty_days_ago,
    )[0][0]

    total_orders = frappe.db.count(
        "Sales Order", {"docstatus": 1, "transaction_date": [">=", thirty_days_ago]}
    )

    pending_orders = frappe.db.count(
        "Sales Order",
        {"docstatus": 1, "status": ["in", ["To Deliver and Bill", "To Bill", "To Deliver"]]},
    )

    total_customers = frappe.db.count("Customer")

    revenue_trend = frappe.db.sql(
        """SELECT DATE(transaction_date) as date, SUM(grand_total) as amount
           FROM `tabSales Order`
           WHERE docstatus = 1 AND transaction_date >= %s
           GROUP BY DATE(transaction_date)
           ORDER BY date""",
        thirty_days_ago,
        as_dict=True,
    )

    top_items = frappe.db.sql(
        """SELECT soi.item_name, SUM(soi.qty) as qty, SUM(soi.amount) as amount
           FROM `tabSales Order Item` soi
           JOIN `tabSales Order` so ON so.name = soi.parent
           WHERE so.docstatus = 1 AND so.transaction_date >= %s
           GROUP BY soi.item_code
           ORDER BY amount DESC
           LIMIT 10""",
        thirty_days_ago,
        as_dict=True,
    )

    order_status_distribution = frappe.db.sql(
        """SELECT status, COUNT(*) as count
           FROM `tabSales Order`
           WHERE docstatus = 1 AND transaction_date >= %s
           GROUP BY status""",
        thirty_days_ago,
        as_dict=True,
    )

    data = {
        "total_revenue": float(total_revenue),
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "total_customers": total_customers,
        "revenue_trend": [
            {"date": str(r["date"]), "amount": float(r["amount"])} for r in revenue_trend
        ],
        "top_items": [
            {"item_name": r["item_name"], "qty": float(r["qty"]), "amount": float(r["amount"])}
            for r in top_items
        ],
        "order_status_distribution": [
            {"status": r["status"], "count": r["count"]} for r in order_status_distribution
        ],
    }

    frappe.cache().set_value(cache_key, json.dumps(data), expires_in_sec=300)
    return data


@frappe.whitelist()
def get_sales_summary(period="monthly"):
    """Sales summary for reporting."""
    if period == "monthly":
        group_by = "DATE_FORMAT(transaction_date, '%%Y-%%m')"
    elif period == "weekly":
        group_by = "YEARWEEK(transaction_date)"
    else:
        group_by = "DATE(transaction_date)"

    return frappe.db.sql(
        f"""SELECT {group_by} as period,
                   COUNT(*) as order_count,
                   SUM(grand_total) as total_amount,
                   AVG(grand_total) as avg_amount
            FROM `tabSales Order`
            WHERE docstatus = 1
            GROUP BY {group_by}
            ORDER BY period DESC
            LIMIT 12""",
        as_dict=True,
    )
