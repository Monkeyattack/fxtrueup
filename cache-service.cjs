const fs = require('fs');
const path = require('path');

class CacheService {
    constructor() {
        this.cacheDir = path.join(__dirname, 'cache');
        this.cacheDuration = 5 * 60 * 1000; // 5 minutes default
        this.ensureCacheDir();
    }

    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    getCacheKey(type, accountId) {
        return `${type}_${accountId}`;
    }

    getCachePath(key) {
        return path.join(this.cacheDir, `${key}.json`);
    }

    get(type, accountId) {
        const key = this.getCacheKey(type, accountId);
        const cachePath = this.getCachePath(key);
        
        try {
            if (fs.existsSync(cachePath)) {
                const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                const now = Date.now();
                
                // Check if cache is still valid
                if (data.timestamp && (now - data.timestamp) < this.cacheDuration) {
                    console.log(`📦 Cache hit for ${type}:${accountId}`);
                    return data.value;
                } else {
                    console.log(`⏰ Cache expired for ${type}:${accountId}`);
                    fs.unlinkSync(cachePath);
                }
            }
        } catch (error) {
            console.error('Cache read error:', error);
        }
        
        return null;
    }

    set(type, accountId, value) {
        const key = this.getCacheKey(type, accountId);
        const cachePath = this.getCachePath(key);
        
        try {
            const cacheData = {
                timestamp: Date.now(),
                value: value
            };
            
            fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
            console.log(`💾 Cached ${type}:${accountId}`);
        } catch (error) {
            console.error('Cache write error:', error);
        }
    }

    clear(type, accountId) {
        const key = this.getCacheKey(type, accountId);
        const cachePath = this.getCachePath(key);
        
        try {
            if (fs.existsSync(cachePath)) {
                fs.unlinkSync(cachePath);
                console.log(`🗑️ Cleared cache for ${type}:${accountId}`);
            }
        } catch (error) {
            console.error('Cache clear error:', error);
        }
    }

    clearAll() {
        try {
            const files = fs.readdirSync(this.cacheDir);
            files.forEach(file => {
                if (file.endsWith('.json')) {
                    fs.unlinkSync(path.join(this.cacheDir, file));
                }
            });
            console.log('🗑️ Cleared all cache');
        } catch (error) {
            console.error('Cache clear all error:', error);
        }
    }

    setCacheDuration(minutes) {
        this.cacheDuration = minutes * 60 * 1000;
        console.log(`⏱️ Cache duration set to ${minutes} minutes`);
    }
}

module.exports = new CacheService();