# Coolify Deployment Troubleshooting Guide

## Common Deployment Issues and Solutions

### Issue 1: Git Clone Timeout (Repository Too Large)

**Symptoms:**
- Deployment fails during "Updating files" phase
- Gets stuck at 90%+ completion
- Error: "Deployment is Failed" without specific error

**Root Cause:**
- Large repository size (132MB+)
- Large Git pack files (16MB+)
- Network timeout during clone operation

**Solutions:**

#### Option 1: Repository Optimization (Recommended)
```bash
# Clean up Git history to reduce repository size
git gc --aggressive --prune=now
git repack -ad
```

#### Option 2: Coolify Configuration Adjustments
1. **Increase Build Timeout:**
   - Go to Coolify → Application → Configuration
   - Set "Build Timeout" to 600 seconds (10 minutes)

2. **Use Shallow Clone:**
   - In Coolify settings, enable "Shallow Clone" if available
   - This reduces clone depth and speeds up the process

#### Option 3: Alternative Deployment Method
```bash
# Create a deployment branch with optimized history
git checkout -b deployment-optimized
git reset --soft HEAD~50  # Squash last 50 commits
git commit -m "Optimized deployment version"
git push origin deployment-optimized
```

### Issue 2: Container Health Check Failures

**Symptoms:**
- Container starts but fails health checks
- Application appears to run but Coolify shows unhealthy

**Solutions:**

1. **Verify Health Endpoint:**
```bash
# Test health endpoint locally
curl http://localhost:3001/health
```

2. **Check Environment Variables:**
   - Ensure all required environment variables are set in Coolify
   - Verify database and Redis connections

3. **Increase Health Check Timeout:**
   - Current setting: 90s start period
   - Increase if database migration takes longer

### Issue 3: Build Dependencies

**Symptoms:**
- npm install fails
- Missing native dependencies

**Solutions:**

1. **Use Alpine Linux packages:**
```dockerfile
RUN apk add --no-cache \
    postgresql-client \
    python3 \
    make \
    g++
```

2. **Clear npm cache:**
```bash
npm cache clean --force
```

### Issue 4: Port Configuration

**Symptoms:**
- Application starts but not accessible
- Port binding errors

**Solutions:**

1. **Verify Port Configuration:**
   - Main app: Port 3000
   - Health check: Port 3001
   - Ensure Coolify port mapping matches

2. **Environment Variables:**
```env
PORT=3000
HEALTH_CHECK_PORT=3001
```

## Deployment Checklist

### Pre-Deployment
- [ ] Repository size < 100MB
- [ ] All environment variables configured
- [ ] Database accessible from Coolify
- [ ] Redis accessible from Coolify

### During Deployment
- [ ] Monitor clone progress
- [ ] Check build logs for errors
- [ ] Verify container startup

### Post-Deployment
- [ ] Health check passes: `curl http://your-app/health`
- [ ] Application responds: `curl http://your-app`
- [ ] Database connection works
- [ ] Redis connection works

## Emergency Rollback

If deployment fails:

1. **Immediate Rollback:**
   - Go to Coolify → Deployments
   - Click on last successful deployment
   - Click "Redeploy"

2. **Alternative:**
   - Revert Git commit: `git revert HEAD`
   - Push to trigger new deployment

## Monitoring Commands

```bash
# Check application logs
docker logs <container-id>

# Check health status
curl -v http://localhost:3001/health

# Check metrics
curl http://localhost:3001/metrics

# Verify database connection
npm run health
```

## Contact Support

If issues persist:
1. Check Coolify logs in the dashboard
2. Verify all environment variables
3. Test locally with same configuration
4. Contact Coolify support with specific error messages

---

**Last Updated:** September 2024
**Version:** 1.0.0