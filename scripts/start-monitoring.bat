@echo off
echo Starting Area51 Bot Monitoring Stack...

echo Pulling Docker images...
docker-compose -f docker/docker-compose.monitoring.yml pull

echo Starting monitoring services...
docker-compose -f docker/docker-compose.monitoring.yml up -d

echo Waiting for services to start...
timeout /t 10

echo.
echo ========================================
echo   Area51 Bot Monitoring Stack Started
echo ========================================
echo.
echo Grafana Dashboard: http://localhost:3000
echo   Username: admin
echo   Password: area51admin
echo.
echo Prometheus: http://localhost:9090
echo AlertManager: http://localhost:9093
echo.
echo Bot Metrics: http://localhost:3001/metrics
echo Bot Health: http://localhost:3001/health
echo.
echo ========================================
