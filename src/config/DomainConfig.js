/**
 * Domain Configuration for Production Deployment
 * Handles domain-specific settings and CORS configuration
 */

class DomainConfig {
    constructor() {
        this.domain = process.env.DOMAIN_NAME || 'localhost';
        this.port = process.env.HEALTH_CHECK_PORT || 3001;
        
        // Determine if running in Coolify production environment
        this.isCoolifyProduction = this.domain !== 'localhost' && this.domain !== '127.0.0.1';
        
        // Protocol: HTTPS for Coolify production, HTTP for local development
        this.protocol = this.isCoolifyProduction ? 'https' : (process.env.PROTOCOL || 'http');
        
        // Build URLs - no port for Coolify production (handled by reverse proxy)
        if (this.isCoolifyProduction) {
            this.baseUrl = `${this.protocol}://${this.domain}`;
        } else {
            this.baseUrl = `${this.protocol}://${this.domain}:${this.port}`;
        }
        
        this.publicUrl = process.env.PUBLIC_URL || this.baseUrl;
        this.monitoringUrl = process.env.MONITORING_URL || `${this.baseUrl}/monitoring`;
        this.healthUrl = process.env.HEALTH_URL || `${this.baseUrl}/health`;
        this.metricsUrl = process.env.METRICS_URL || `${this.baseUrl}/metrics`;
        
        // CORS configuration
        this.corsOrigins = this.buildCorsOrigins();
    }

    /**
     * Build CORS origins based on domain configuration
     */
    buildCorsOrigins() {
        const origins = [
            this.publicUrl,
            this.baseUrl
        ];

        if (this.isCoolifyProduction) {
            // Production with Coolify - HTTPS only, no port
            origins.push(
                `https://${this.domain}`,
                `http://${this.domain}` // Fallback for redirects
            );
        } else {
            // Local development - include both HTTP and HTTPS with ports
            origins.push(
                `http://${this.domain}`,
                `https://${this.domain}`,
                `http://${this.domain}:${this.port}`,
                `https://${this.domain}:${this.port}`,
                'http://localhost:3001',
                'http://127.0.0.1:3001',
                'http://localhost:3000',
                'http://127.0.0.1:3000'
            );
        }

        return [...new Set(origins)]; // Remove duplicates
    }

    /**
     * Get CORS configuration for Express
     */
    getCorsConfig() {
        const config = {
            origin: this.corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        };

        // Add security headers for HTTPS in production
        if (this.isCoolifyProduction && this.isSSLEnabled()) {
            config.optionsSuccessStatus = 200;
            config.preflightContinue = false;
        }

        return config;
    }

    /**
     * Get security headers for HTTPS
     */
    getSecurityHeaders() {
        if (!this.isCoolifyProduction || !this.isSSLEnabled()) {
            return {};
        }

        return {
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Content-Security-Policy': `default-src 'self' https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;`
        };
    }

    /**
     * Get all URLs for logging
     */
    getUrls() {
        return {
            base: this.baseUrl,
            public: this.publicUrl,
            monitoring: this.monitoringUrl,
            health: this.healthUrl,
            metrics: this.metricsUrl
        };
    }

    /**
     * Check if running in production with custom domain
     */
    isProductionDomain() {
        return this.isCoolifyProduction;
    }

    /**
     * Check if SSL/HTTPS is enabled
     */
    isSSLEnabled() {
        return this.protocol === 'https';
    }

    /**
     * Get domain info for logging
     */
    getDomainInfo() {
        return {
            domain: this.domain,
            port: this.port,
            protocol: this.protocol,
            isProduction: this.isProductionDomain(),
            isCoolifyProduction: this.isCoolifyProduction,
            sslEnabled: this.isSSLEnabled(),
            corsOrigins: this.corsOrigins.length,
            baseUrl: this.baseUrl
        };
    }
}

module.exports = DomainConfig;