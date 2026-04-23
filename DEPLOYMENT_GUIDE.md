# Glovecubs Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Variables
Create a `.env` file in the root directory with the following variables:

```env
PORT=3004
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
SESSION_SECRET=your-super-secret-session-key-change-this-in-production

# Email Configuration (Optional - for email notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@glovecubs.com

# Supabase (required - single source of truth)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Domain
DOMAIN=https://glovecubs.com
```

### 2. Security Checklist
- [ ] Change all default passwords
- [ ] Update JWT_SECRET and SESSION_SECRET to strong random strings
- [ ] Enable HTTPS/SSL
- [ ] Set up CORS properly for production domain
- [ ] Review and update admin credentials
- [ ] Enable rate limiting (recommended)
- [ ] Set up proper file upload restrictions

### 3. Database Backup
- [ ] Supabase: use project backups / point-in-time recovery
- [ ] Set up automated backups in Supabase dashboard
- [ ] Test restore process

### 4. Testing
- [ ] Test all user flows (registration, login, checkout)
- [ ] Test admin panel functionality
- [ ] Test RFQ submission
- [ ] Test email notifications (if enabled)
- [ ] Test mobile responsiveness
- [ ] Test on multiple browsers
- [ ] Load testing (if expected high traffic)

## Deployment Options

### Option 1: Vercel (Recommended for Node.js)

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Create `vercel.json`:**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server.js"
    },
    {
      "src": "/(.*)",
      "dest": "public/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

3. **Deploy:**
```bash
vercel
```

4. **Set Environment Variables:**
- Go to Vercel Dashboard → Project → Settings → Environment Variables
- Add all variables from `.env`

### Option 2: Heroku

1. **Install Heroku CLI:**
```bash
npm install -g heroku
```

2. **Create `Procfile`:**
```
web: node server.js
```

3. **Deploy:**
```bash
heroku create glovecubs
git push heroku main
```

4. **Set Environment Variables:**
```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret
heroku config:set SESSION_SECRET=your-secret
heroku config:set PORT=3004
```

### Option 3: AWS EC2 / DigitalOcean

1. **SSH into your server**

2. **Install Node.js:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Clone repository:**
```bash
git clone your-repo-url
cd Glovecubs
```

4. **Install dependencies:**
```bash
npm install --production
```

5. **Set up PM2 (Process Manager):**
```bash
npm install -g pm2
pm2 start server.js --name glovecubs
pm2 save
pm2 startup
```

6. **Set up Nginx reverse proxy:**
```nginx
server {
    listen 80;
    server_name glovecubs.com www.glovecubs.com;

    location / {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

7. **Set up SSL with Let's Encrypt:**
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d glovecubs.com -d www.glovecubs.com
```

### Option 4: Docker

1. **Create `Dockerfile`:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3004
CMD ["node", "server.js"]
```

2. **Create `docker-compose.yml`:**
```yaml
version: '3.8'
services:
  glovecubs:
    build: .
    ports:
      - "3004:3004"
    environment:
      - NODE_ENV=production
      - PORT=3004
    volumes:
      - ./database.json:/app/database.json
    restart: unless-stopped
```

3. **Build and run:**
```bash
docker-compose up -d
```

## Post-Deployment

### 1. Domain Configuration
- [ ] Point domain DNS to your hosting provider
- [ ] Set up SSL certificate
- [ ] Update CORS settings if needed
- [ ] Update canonical URLs in HTML

### 2. Monitoring
- [ ] Set up error tracking (Sentry, LogRocket, etc.)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure log aggregation
- [ ] Set up performance monitoring

### 3. Backup Strategy
- [ ] Set up automated database backups
- [ ] Test restore process
- [ ] Document backup procedures

### 4. Performance Optimization
- [ ] Enable gzip compression
- [ ] Set up CDN for static assets
- [ ] Optimize images
- [ ] Enable browser caching

## Maintenance

### Regular Tasks
- Weekly: Review error logs
- Monthly: Update dependencies
- Quarterly: Security audit
- As needed: Database backups

### Updating the Application
1. Pull latest changes: `git pull`
2. Install dependencies: `npm install`
3. Restart server: `pm2 restart glovecubs` (or your process manager)
4. Test functionality

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Find process using port 3004
lsof -i :3004
# Kill process
kill -9 <PID>
```

**Supabase connection:**
- Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env
- Check Supabase project status and quotas

**Node modules issues:**
```bash
rm -rf node_modules package-lock.json
npm install
```

## Support

For deployment issues, check:
- Server logs: `pm2 logs glovecubs`
- Application logs: Check `server.js` console output
- Error tracking: Check your error tracking service
