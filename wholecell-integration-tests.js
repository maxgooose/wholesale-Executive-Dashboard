/**
 * Wholecell Integration Test Suite
 * =================================
 * Comprehensive tests for Wholecell API integration
 */

class WholecellIntegrationTests {
    constructor() {
        this.results = [];
        this.api = new WholecellAPI();
        this.testData = null;
    }

    /**
     * Run all tests
     */
    async runAll() {
        console.log('🧪 Starting Wholecell Integration Tests...');
        console.log('='.repeat(60));
        
        this.results = [];
        
        await this.testProxyHealth();
        await this.testFetchData();
        await this.testTransformation();
        await this.testCaching();
        await this.testDataValidation();
        await this.testFieldMapping();
        await this.testExistingFeatures();
        
        this.printResults();
        return this.results;
    }

    /**
     * Test: Proxy Health Check
     */
    async testProxyHealth() {
        const testName = 'Proxy Health Check';
        console.log(`\n📋 Test: ${testName}`);
        
        try {
            const healthy = await this.api.checkHealth();
            
            if (healthy) {
                this.pass(testName, 'Proxy server is healthy');
            } else {
                this.fail(testName, 'Proxy server not responding');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    /**
     * Test: Fetch Data from Wholecell
     */
    async testFetchData() {
        const testName = 'Fetch Data from Wholecell';
        console.log(`\n📋 Test: ${testName}`);
        
        try {
            // Fetch just first page for testing
            const response = await fetch('http://localhost:5001/api/inventory?page=1');
            const data = await response.json();
            
            if (data && data.data && data.data.length > 0) {
                this.testData = data.data;
                this.pass(testName, `Fetched ${data.data.length} items (Page 1 of ${data.pages})`);
            } else {
                this.fail(testName, 'No data received from Wholecell');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    /**
     * Test: Data Transformation
     */
    async testTransformation() {
        const testName = 'Data Transformation';
        console.log(`\n📋 Test: ${testName}`);
        
        if (!this.testData || this.testData.length === 0) {
            this.skip(testName, 'No test data available');
            return;
        }
        
        try {
            const transformed = WholecellTransformer.transformAll(this.testData);
            const stats = WholecellTransformer.getTransformStats(this.testData, transformed);
            
            if (stats.successRate >= 95) {
                this.pass(testName, `Transform success rate: ${stats.successRate}%`);
            } else {
                this.fail(testName, `Low success rate: ${stats.successRate}%`);
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    /**
     * Test: Caching System
     */
    async testCaching() {
        const testName = 'Caching System';
        console.log(`\n📋 Test: ${testName}`);
        
        try {
            // Clear cache first
            this.api.clearCache();
            
            // First fetch (should hit API)
            const start1 = Date.now();
            await fetch('http://localhost:5001/api/inventory?page=1');
            const time1 = Date.now() - start1;
            
            // Get cache info
            const cacheInfo = this.api.getCacheInfo();
            
            if (cacheInfo.hasCache) {
                this.pass(testName, `Cache working (First fetch: ${time1}ms)`);
            } else {
                this.fail(testName, 'Cache not storing data');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    /**
     * Test: Data Validation
     */
    async testDataValidation() {
        const testName = 'Data Validation';
        console.log(`\n📋 Test: ${testName}`);
        
        if (!this.testData || this.testData.length === 0) {
            this.skip(testName, 'No test data available');
            return;
        }
        
        try {
            const transformed = WholecellTransformer.transformAll(this.testData);
            const validItems = transformed.filter(item => 
                WholecellTransformer.validateItem(item)
            );
            
            const validPercent = (validItems.length / transformed.length * 100).toFixed(2);
            
            if (validPercent >= 95) {
                this.pass(testName, `${validPercent}% of items valid`);
            } else {
                this.fail(testName, `Only ${validPercent}% of items valid`);
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    /**
     * Test: Field Mapping
     */
    async testFieldMapping() {
        const testName = 'Field Mapping';
        console.log(`\n📋 Test: ${testName}`);
        
        if (!this.testData || this.testData.length === 0) {
            this.skip(testName, 'No test data available');
            return;
        }
        
        try {
            const original = this.testData[0];
            const transformed = WholecellTransformer.transformItem(original);
            
            const mappings = [
                { from: 'esn', to: 'IMEI/ SERIAL NO.' },
                { from: 'product_variation.product.capacity', to: 'STORAGE' },
                { from: 'product_variation.product.color', to: 'COLOR' },
                { from: 'product_variation.grade', to: 'GRADE' },
                { from: 'status', to: 'STATUS' }
            ];
            
            let allMapped = true;
            for (const mapping of mappings) {
                if (!transformed[mapping.to]) {
                    allMapped = false;
                    console.log(`  ❌ Missing mapping: ${mapping.from} → ${mapping.to}`);
                }
            }
            
            if (allMapped) {
                this.pass(testName, 'All required fields mapped correctly');
            } else {
                this.fail(testName, 'Some field mappings missing');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    /**
     * Test: Existing Features Compatibility
     */
    async testExistingFeatures() {
        const testName = 'Existing Features Compatibility';
        console.log(`\n📋 Test: ${testName}`);
        
        if (!this.testData || this.testData.length === 0) {
            this.skip(testName, 'No test data available');
            return;
        }
        
        try {
            const transformed = WholecellTransformer.transformAll(this.testData);
            
            // Test if data structure works with existing code
            const checks = {
                'Has IMEI field': transformed[0]['IMEI/ SERIAL NO.'] !== undefined,
                'Has MODEL field': transformed[0]['MODEL'] !== undefined,
                'Has GRADE field': transformed[0]['GRADE'] !== undefined,
                'Has STATUS field': transformed[0]['STATUS'] !== undefined,
                'Can generate summary': this.canGenerateSummary(transformed),
                'Has location data': transformed[0]['location'] !== undefined
            };
            
            const passed = Object.values(checks).filter(v => v).length;
            const total = Object.keys(checks).length;
            
            console.log(`  Compatibility checks: ${passed}/${total}`);
            Object.entries(checks).forEach(([name, result]) => {
                console.log(`    ${result ? '✅' : '❌'} ${name}`);
            });
            
            if (passed === total) {
                this.pass(testName, `All ${total} compatibility checks passed`);
            } else {
                this.fail(testName, `Only ${passed}/${total} checks passed`);
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    /**
     * Helper: Check if summary generation works
     */
    canGenerateSummary(data) {
        try {
            const summaryMap = new Map();
            data.forEach(item => {
                const key = `${item.MODEL}|${item.STORAGE}`;
                if (!summaryMap.has(key)) {
                    summaryMap.set(key, { count: 0 });
                }
                summaryMap.get(key).count++;
            });
            return summaryMap.size > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Record test pass
     */
    pass(testName, message) {
        console.log(`  ✅ PASS: ${message}`);
        this.results.push({
            test: testName,
            status: 'pass',
            message: message
        });
    }

    /**
     * Record test fail
     */
    fail(testName, message) {
        console.log(`  ❌ FAIL: ${message}`);
        this.results.push({
            test: testName,
            status: 'fail',
            message: message
        });
    }

    /**
     * Record test skip
     */
    skip(testName, message) {
        console.log(`  ⏭️  SKIP: ${message}`);
        this.results.push({
            test: testName,
            status: 'skip',
            message: message
        });
    }

    /**
     * Print test results summary
     */
    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('='.repeat(60));
        
        const passed = this.results.filter(r => r.status === 'pass').length;
        const failed = this.results.filter(r => r.status === 'fail').length;
        const skipped = this.results.filter(r => r.status === 'skip').length;
        const total = this.results.length;
        
        console.log(`\nTotal Tests: ${total}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⏭️  Skipped: ${skipped}`);
        
        const passRate = total > 0 ? ((passed / (total - skipped)) * 100).toFixed(2) : 0;
        console.log(`\n📈 Pass Rate: ${passRate}%`);
        
        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.results
                .filter(r => r.status === 'fail')
                .forEach(r => console.log(`  - ${r.test}: ${r.message}`));
        }
        
        console.log('\n' + '='.repeat(60));
        
        if (failed === 0 && passed > 0) {
            console.log('🎉 ALL TESTS PASSED! Integration successful!');
        } else if (failed > 0) {
            console.log('⚠️  Some tests failed. Please review and fix.');
        }
        
        console.log('='.repeat(60) + '\n');
    }

    /**
     * Get results as JSON
     */
    getResults() {
        return {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.results.length,
                passed: this.results.filter(r => r.status === 'pass').length,
                failed: this.results.filter(r => r.status === 'fail').length,
                skipped: this.results.filter(r => r.status === 'skip').length
            },
            results: this.results
        };
    }
}

// Make available globally
window.WholecellIntegrationTests = WholecellIntegrationTests;

// Quick test runner
window.runWholecellTests = async function() {
    const tester = new WholecellIntegrationTests();
    return await tester.runAll();
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WholecellIntegrationTests;
}

