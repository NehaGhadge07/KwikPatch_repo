import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "kwikpatch.db"))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        consignee_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS upload_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        customer_id INTEGER,
        pi_number TEXT,
        status TEXT,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS product_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        pi_product_name TEXT,
        planning_item_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id),
        UNIQUE(customer_id, pi_product_name)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS planning_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        upload_id INTEGER,
        item_name TEXT,
        compound TEXT,
        side TEXT,
        thou INTEGER,
        die_type TEXT,
        die_name TEXT,
        die_size TEXT,
        comp_sheet_size TEXT,
        per_sheet_item INTEGER,
        order_qty INTEGER,
        required_sheet REAL,
        per_sheet_gm REAL,
        per_sheet_weight_gm REAL,
        total_kg REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id),
        FOREIGN KEY(upload_id) REFERENCES upload_history(id)
    )
    ''')

    # Users table — passwordless, OTP-based
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        mobile TEXT,
        is_verified INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Migration: add columns that may be missing from earlier schema
    cursor.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in cursor.fetchall()]
    if "mobile" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN mobile TEXT")
    if "is_verified" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0")

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'register',
        expires_at REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Migration: add purpose column if missing
    cursor.execute("PRAGMA table_info(otp_codes)")
    otp_columns = [col[1] for col in cursor.fetchall()]
    if "purpose" not in otp_columns:
        cursor.execute("ALTER TABLE otp_codes ADD COLUMN purpose TEXT NOT NULL DEFAULT 'register'")

    # Auth audit log table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS auth_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        email TEXT,
        mobile TEXT,
        status TEXT NOT NULL,
        detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    conn.commit()
    conn.close()
