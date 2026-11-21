const puppeteer = require('puppeteer-core');
const fs = require('fs');

const OUTPUT_FILE = 'C:\\Users\\aashu\\OneDrive\\Desktop\\kado\\docs\\research\\ranbazaar\\live-fetch.json';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
        defaultViewport: { width: 1920, height: 1080 },
    });

    const page = await browser.newPage();
    const apiResponses = {};

    // Intercept ALL responses from ranbazaar.com
    page.on('response', async (res) => {
        const url = res.url();
        if (url.includes('ranbazaar.com/api/')) {
            const contentType = res.headers()['content-type'] || '';
            if (contentType.includes('json')) {
                try {
                    const text = await res.text();
                    let json;
                    try { json = JSON.parse(text); } catch(e) { json = { raw: text.substring(0, 500) }; }
                    apiResponses[url] = { status: res.status(), data: json };
                    console.log(`[API] ${url} -> ${res.status()} (${typeof json === 'object' ? JSON.stringify(json).substring(0, 200) : text.substring(0, 200)})`);
                } catch (e) { /* ignore */ }
            } else {
                try {
                    const text = await res.text();
                    if (text && text !== 'Unauthorized' && text !== 'No route for this path') {
                        console.log(`[API] ${url} -> ${res.status()} (${text.substring(0, 200)})`);
                    }
                } catch (e) { /* ignore */ }
            }
        }
    });

    page.on('request', (req) => {
        const url = req.url();
        if (url.includes('ranbazaar.com/api/')) {
            console.log(`[REQ] ${url}`);
        }
    });

    try {
        // Visit homepage to load all initial data
        console.log('\n=== Visiting Homepage ===');
        await page.goto('https://ranbazaar.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(5000);
        console.log('Homepage loaded. API responses captured:', Object.keys(apiResponses).length);

        // Extract product data from the page DOM
        console.log('\n=== Extracting Product Data from DOM ===');
        const domData = await page.evaluate(() => {
            const products = [];
            // Look for product cards - the site uses cards with product info
            const cards = document.querySelectorAll('[class*="card"], [class*="product"]');

            // Also try to find all elements with price patterns
            const allElements = document.querySelectorAll('*');
            const productElements = [];

            allElements.forEach(el => {
                const text = el.textContent?.trim() || '';
                const html = el.innerHTML || '';
                if (text.includes('Rs.') && text.length < 500 && text.length > 10) {
                    if (el.children.length < 5) {
                        productElements.push({
                            tag: el.tagName,
                            class: el.className,
                            text: text.substring(0, 200),
                        });
                    }
                }
            });

            return {
                cardCount: cards.length,
                productElements: productElements.slice(0, 30),
                // Get all links
                allLinks: Array.from(document.querySelectorAll('a')).map(a => ({
                    href: a.href,
                    text: a.textContent?.trim().substring(0, 100),
                })).filter(l => l.href && l.href.includes('ranbazaar.com')),
            };
        });

        console.log('Card count:', domData.cardCount);
        console.log('Product elements found:', domData.productElements.length);
        console.log('Links found:', domData.allLinks.length);

        // Extract product links
        const productLinks = domData.allLinks.filter(l =>
            l.href.includes('product') || l.href.match(/\/p\/|product-\d+|product\/\d+/) ||
            l.href.includes('category')
        );
        console.log('Product/category links:', productLinks.length);
        productLinks.forEach(l => console.log(`  ${l.href}`));

        // Get all text from the page
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log('\n=== Page Text (first 3000 chars) ===');
        console.log(pageText.substring(0, 3000));

        // Now let's try to get the categories API by modifying request headers
        console.log('\n=== Testing Categories API with browser context ===');
        const catResult = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/frontend/categories', {
                    headers: {
                        'Accept': 'application/json',
                        'Referer': 'https://ranbazaar.com/',
                        'X-Requested-With': 'XMLHttpRequest',
                    }
                });
                const text = await res.text();
                return { status: res.status, text: text.substring(0, 1000) };
            } catch(e) {
                return { error: e.message };
            }
        });
        console.log('Categories API:', catResult);

        // Test homepage product API
        console.log('\n=== Testing Homepage Product API ===');
        const homeProductResult = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/homepage/product', {
                    headers: {
                        'Accept': 'application/json',
                        'Referer': 'https://ranbazaar.com/',
                        'X-Requested-With': 'XMLHttpRequest',
                    }
                });
                const text = await res.text();
                return { status: res.status, text: text.substring(0, 2000) };
            } catch(e) {
                return { error: e.message };
            }
        });
        console.log('Homepage Product API:', JSON.stringify(homeProductResult).substring(0, 500));

        // Test home API
        console.log('\n=== Testing Home API ===');
        const homeResult = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/home', {
                    headers: {
                        'Accept': 'application/json',
                        'Referer': 'https://ranbazaar.com/',
                        'X-Requested-With': 'XMLHttpRequest',
                    }
                });
                const text = await res.text();
                return { status: res.status, text: text.substring(0, 2000) };
            } catch(e) {
                return { error: e.message };
            }
        });
        console.log('Home API:', JSON.stringify(homeResult).substring(0, 500));

        // Test approved reviews
        console.log('\n=== Testing Reviews API ===');
        const reviewsResult = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/approved/reviews', {
                    headers: {
                        'Accept': 'application/json',
                        'Referer': 'https://ranbazaar.com/',
                        'X-Requested-With': 'XMLHttpRequest',
                    }
                });
                const text = await res.text();
                return { status: res.status, text: text.substring(0, 1000) };
            } catch(e) {
                return { error: e.message };
            }
        });
        console.log('Reviews API:', JSON.stringify(reviewsResult).substring(0, 500));

        // Try pages API
        console.log('\n=== Testing Pages API ===');
        const pagesResult = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/pages', {
                    headers: {
                        'Accept': 'application/json',
                        'Referer': 'https://ranbazaar.com/',
                    }
                });
                const text = await res.text();
                return { status: res.status, text: text.substring(0, 1000) };
            } catch(e) {
                return { error: e.message };
            }
        });
        console.log('Pages API:', pagesResult);

        // Try settings API
        console.log('\n=== Testing Settings API ===');
        const settingsResult = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/settings/forcustomer', {
                    headers: {
                        'Accept': 'application/json',
                        'Referer': 'https://ranbazaar.com/',
                    }
                });
                const text = await res.text();
                return { status: res.status, text: text.substring(0, 2000) };
            } catch(e) {
                return { error: e.message };
            }
        });
        console.log('Settings API:', settingsResult);

        // Try banners API
        console.log('\n=== Testing Banners API ===');
        const bannersResult = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/frontend/banners', {
                    headers: {
                        'Accept': 'application/json',
                        'Referer': 'https://ranbazaar.com/',
                    }
                });
                const text = await res.text();
                return { status: res.status, text: text.substring(0, 1000) };
            } catch(e) {
                return { error: e.message };
            }
        });
        console.log('Banners API:', bannersResult);

        // Try to find the actual product listing URL pattern
        // The site has products showing on homepage. Let's extract product info from the rendered page
        console.log('\n=== Extracting Full Page Data ===');
        const fullPageData = await page.evaluate(() => {
            const results = {
                title: document.title,
                headings: Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
                    tag: h.tagName,
                    text: h.textContent?.trim(),
                })).filter(h => h.text),
                links: Array.from(document.querySelectorAll('a')).map(a => ({
                    href: a.href,
                    text: a.textContent?.trim().substring(0, 80),
                })).filter(l => l.href.includes('ranbazaar.com') && l.href !== 'https://ranbazaar.com/'),
                allProductCards: [],
            };

            // Try to find product cards by looking for elements with prices
            const priceRegex = /Rs\.?\s*\d+/g;
            const allDivs = document.querySelectorAll('div');

            allDivs.forEach(div => {
                const text = div.textContent?.trim() || '';
                const html = div.innerHTML || '';
                if (text.match(priceRegex) && text.length > 20 && text.length < 1000 && div.children.length < 10) {
                    results.allProductCards.push({
                        text: text.substring(0, 300),
                        htmlSnippet: html.substring(0, 300),
                        classes: div.className,
                    });
                }
            });

            return results;
        });

        console.log('Headings:', fullPageData.headings);
        console.log('Links:', fullPageData.links.length);
        console.log('Product cards found:', fullPageData.allProductCards.length);

        // Now navigate to a category page and see what API calls are made
        console.log('\n=== Navigating to product-list ===');
        await page.goto('https://ranbazaar.com/product-list/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(5000);

        // Clear previous responses and capture new ones
        const categoryPageResponses = {};
        const handler = async (res) => {
            const url = res.url();
            if (url.includes('ranbazaar.com/api/')) {
                const contentType = res.headers()['content-type'] || '';
                if (contentType.includes('json')) {
                    try {
                        const text = await res.text();
                        let json;
                        try { json = JSON.parse(text); } catch(e) { json = text.substring(0, 500); }
                        categoryPageResponses[url] = { status: res.status(), data: json };
                        console.log(`[PROD-LIST] ${url} -> ${res.status()}: ${JSON.stringify(json).substring(0, 300)}`);
                    } catch(e) {}
                }
            }
        };
        page.removeAllListeners('response');
        page.on('response', handler);

        await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
        await delay(5000);
        console.log('Product list page API responses:', Object.keys(categoryPageResponses));

        // Extract all product info from product-list page
        const productListData = await page.evaluate(() => {
            const results = {
                text: document.body.innerText.substring(0, 5000),
                links: Array.from(document.querySelectorAll('a')).map(a => ({
                    href: a.href,
                    text: a.textContent?.trim().substring(0, 80),
                })).filter(l => l.href && l.href.includes('ranbazaar.com')),
                // Get all prices
                prices: [],
                // Get all product names
                productNames: [],
            };

            // Find all elements containing prices
            const priceElements = document.querySelectorAll('*');
            priceElements.forEach(el => {
                const text = el.textContent?.trim() || '';
                const priceMatch = text.match(/Rs\.?\s*(\d+)/);
                if (priceMatch && text.length < 500 && el.children.length < 5) {
                    results.prices.push({
                        text: text.substring(0, 200),
                        price: priceMatch[0],
                    });
                }
            });

            return results;
        });

        console.log('\nProduct list text (first 1000):', productListData.text.substring(0, 1000));
        console.log('Prices found:', productListData.prices.length);

        // Try clicking on a product to get product detail API
        console.log('\n=== Trying to find product URLs ===');
        const productUrls = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h =>
                h.includes('product') || h.match(/\/\d+\//) || h.includes('item')
            );
        });
        console.log('Potential product URLs:', productUrls.slice(0, 20));

        // Try navigating to a specific product page
        if (productUrls.length > 0) {
            console.log('\n=== Navigating to first product ===');
            await page.goto(productUrls[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
            await delay(5000);

            const productDetailResponses = {};
            page.removeAllListeners('response');
            page.on('response', async (res) => {
                const url = res.url();
                if (url.includes('ranbazaar.com/api/')) {
                    const contentType = res.headers()['content-type'] || '';
                    if (contentType.includes('json')) {
                        try {
                            const text = await res.text();
                            let json;
                            try { json = JSON.parse(text); } catch(e) { json = text.substring(0, 1000); }
                            productDetailResponses[url] = { status: res.status(), data: json };
                            console.log(`[PRODUCT-PAGE] ${url} -> ${res.status()}: ${JSON.stringify(json).substring(0, 500)}`);
                        } catch(e) {}
                    }
                }
            });

            await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
            await delay(5000);
            console.log('Product detail APIs:', JSON.stringify(productDetailResponses, null, 2).substring(0, 1000));
        }

        // Compile all data
        const finalData = {
            site: 'https://ranbazaar.com',
            fetchedAt: new Date().toISOString(),
            siteInfo: {
                title: fullPageData.title || 'Ranbazaar - Khushiyon Ka Bazaar',
                description: 'India\'s No. 1 site for customize kids products',
                platform: 'React SPA + Django REST Framework',
                currency: 'INR',
            },
            robots: fs.readFileSync('C:\\Users\\aashu\\.claude\\projects\\c--Users-aashu-OneDrive-Desktop-kado\\d3e8c298-327d-451a-8a66-049b18ca13c2\\tool-results\\bq85p0mhg.txt').toString().substring(0, 5000),
            apiEndpointsDiscovered: [
                'https://ranbazaar.com/api/frontend/categories',
                'https://ranbazaar.com/api/homepage/product',
                'https://ranbazaar.com/api/home',
                'https://ranbazaar.com/api/approved/reviews',
                'https://ranbazaar.com/api/frontend/banners',
                'https://ranbazaar.com/api/pages',
                'https://ranbazaar.com/api/settings/forcustomer',
                'https://ranbazaar.com/api/social',
            ],
            apiResponses: apiResponses,
            categories: [],
            products: [],
            categoryLinks: productListData.links,
            pageText: pageText,
            priceData: productListData.prices,
        };

        // Save the data
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log(`\n\n=== Data saved to ${OUTPUT_FILE} ===`);
        console.log('Total API responses:', Object.keys(apiResponses).length);
        console.log('Total category/product links:', productListData.links.length);

        // Output the API responses for inspection
        console.log('\n=== All API Responses ===');
        for (const [url, data] of Object.entries(apiResponses)) {
            console.log(`\n[${url}]`);
            console.log(JSON.stringify(data.data).substring(0, 500));
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

main().catch(console.error);
