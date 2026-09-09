# Production Deployment Guide: Hostinger VPS

This guide provides step-by-step instructions to deploy the KwikPatch Compound Planning application to production on **Hostinger VPS** (running Ubuntu 20.04/22.04 LTS).

---

## 🏗️ Deployment Architecture

The application is deployed as a single, unified service:
* **Frontend**: Built using Vite as highly optimized static files (HTML/CSS/JS) and stored in `frontend/dist`.
* **Backend (FastAPI)**: Serves the static Vite frontend at the root path (`/`) and exposes the API endpoints under `/api`.
* **Process Manager**: Uvicorn/Gunicorn manages the FastAPI Python process under a background `systemd` daemon.
* **Web Server & SSL (Nginx)**: Acts as a reverse proxy, mapping public traffic from HTTP (80) and HTTPS (443) to port 8000, and managing SSL certificates (via Let's Encrypt).

---

## 📋 Step-by-Step Installation

### Step 1: Clone and Prepare Workspace
SSH into your Hostinger VPS and pull the codebase:
```bash
cd /var/www
git clone <your-repository-url> kwikpatch
cd kwikpatch
```

### Step 2: Build the React Vite Frontend
Make sure you have Node.js installed on your server (Node 18+ is recommended).
```bash
# Move to frontend directory
cd frontend

# Install package dependencies
npm install

# Compile the optimized production build
npm run build
```
This creates the compiled static bundle in `/var/www/kwikpatch/frontend/dist`.

---

### Step 3: Set Up Python Backend Environment
Ensure Python 3.10+ and pip are installed:
```bash
cd /var/www/kwikpatch

# Create a virtual environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Install backend dependencies
pip install --upgrade pip
pip install -r requirements.txt

# (Optional) Install gunicorn for multi-process load handling
pip install gunicorn
```

---

### Step 4: Configure systemd Service Daemon
To run the FastAPI server continuously in the background and restart it automatically if the VPS reboots, create a `systemd` service file.

Create a new service configuration:
```bash
sudo nano /etc/systemd/system/kwikpatch.service
```

Paste the following configuration:
```ini
[Unit]
Description=KwikPatch FastAPI ASGI Server
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/kwikpatch
Environment="PATH=/var/www/kwikpatch/venv/bin"
Environment="DB_PATH=/var/www/kwikpatch/backend/kwikpatch.db"
Environment="PLANNING_FILE_PATH=/var/www/kwikpatch/Compound Planing file.xlsx"
# Optional SMTP configuration for OTP emails:
# Environment="SMTP_HOST=smtp.gmail.com"
# Environment="SMTP_PORT=587"
# Environment="SMTP_USER=your-email@gmail.com"
# Environment="SMTP_PASSWORD=your-app-password"
ExecStart=/var/www/kwikpatch/venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 2

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`). 

Change ownership of the directory to the runner user (`www-data`):
```bash
sudo chown -R www-data:www-data /var/www/kwikpatch
```

Start the service and enable it to run on boot:
```bash
sudo systemctl daemon-reload
sudo systemctl start kwikpatch
sudo systemctl enable kwikpatch
```

Verify the service is running:
```bash
sudo systemctl status kwikpatch
```

---

### Step 5: Configure Nginx Reverse Proxy & Let's Encrypt SSL
Nginx will handle domain bindings, reverse proxy requests to port `8000`, and manage SSL/TLS certificates.

Install Nginx:
```bash
sudo apt update
sudo apt install nginx -y
```

Create a new Nginx server configuration:
```bash
sudo nano /etc/nginx/sites-available/kwikpatch
```

Paste the following server configuration (replace `yourdomain.com` with your Hostinger domain):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Increase client upload body size to support large uploads (~25MB JULY 2026.xlsx)
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/kwikpatch /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default # Remove default splash screen config if active
sudo nginx -t # Verify syntax is correct
sudo systemctl restart nginx
```

#### Install Free SSL Certificate (Certbot Let's Encrypt):
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
Follow the prompts. Certbot will automatically install the certificates and configure Nginx to redirect all HTTP traffic to secure HTTPS automatically!

---

## ⚙️ Maintenance & Updates

When updating the application code in the future:
1. Pull new changes: `git pull`
2. Build the frontend if there are UI edits: `cd frontend && npm run build`
3. Restart the systemd service: `sudo systemctl restart kwikpatch`
4. All database tables and dynamic customer worksheets inside the master Excel files will automatically persist across builds.
