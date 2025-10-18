/**
 * Domain Configuration for Production Deployment
 * Handles domain-specific settings and CORS configuration
 */

class DomainConfig {
    constructor() {
        this.domain = process.env.DOMAIN_NAME || 'localhost';
        this.port = process.env.HEALTH_CHECK_PORT || 3001;
        this.protocol = process.env.PROTOCOL || 'http';
        
        // Build URLs - don't include port if it's 80 (default HTTP port)
        const portSuffix = (this.port == 80) ? '' : `:${this.port}`;
        this.baseUrl = `${this.protocol}://${this.domain}${portSuffix}`;
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
            this.baseUrl,
            `http://${this.domain}`,
            `https://${this.domain}`,
            `http://${this.domain}:${this.port}`,
            `https://${this.domain}:${this.port}`
        ];

        // Add localhost for development
        if (process.env.NODE_ENV !== 'production') {
            origins.push(
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
        return {
            origin: this.corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
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
        return this.domain !== 'localhost' && this.domain !== '127.0.0.1';
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
            corsOrigins: this.corsOrigins.length
        };
    }
}

module.exports = DomainConfig;