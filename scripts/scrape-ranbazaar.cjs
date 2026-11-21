const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join('C:\\Users\\aashu\\OneDrive\\Desktop\\kado\\docs\\research\\ranbazaar');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'live-fetch.json');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

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
            '--disable-features=IsolateOrigins,site-per-process',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
        defaultViewport: { width: 1920, height: 1080 },
    });

    const page = await browser.newPage();
    const allApiCalls = [];
    const allProducts = [];

    // Intercept network requests
    page.on('request', (req) => {
        const url = req.url();
        if (url.includes('api') || url.includes('product') || url.includes('category') || url.includes('search')) {
            allApiCalls.push({
                url: url,
                method: req.method(),
                type: req.resourceType(),
            });
        }
    });

    page.on('response', async (res) => {
        const url = res.url();
        if ((url.includes('api') || url.includes('product') || url.includes('category')) && !url.includes('.css') && !url.includes('.js') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('.svg') && !url.includes('.woff')) {
            try {
                const contentType = res.headers()['content-type'] || '';
                if (contentType.includes('json')) {
                    const text = await res.text();
                    let json;
                    try { json = JSON.parse(text); } catch (e) { json = text.substring(0, 500); }
                    allApiCalls.push({
                        url: url,
                        status: res.status(),
                        contentType: contentType,
                        body: json,
                    });
                }
            } catch (e) { /* ignore */ }
        }
    });

    try {
        // Visit homepage
        console.log('Visiting https://ranbazaar.com/...');
        await page.goto('https://ranbazaar.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(5000);
        console.log('Homepage loaded');

        // Get initial HTML content to extract product data if server-side rendered
        const initialContent = await page.content();
        console.log(`Initial HTML length: ${initialContent.length}`);

        // Look for product data in the page
        console.log('\n--- API Calls Found ---');
        const uniqueApiCalls = [...new Set(allApiCalls.map(a => a.url))];
        uniqueApiCalls.forEach(u => console.log(u));

        // Extract all links
        const links = await page.evaluate(() => {
            const allLinks = Array.from(document.querySelectorAll('a'));
            return allLinks.map(a => ({
                href: a.href,
                text: a.textContent?.trim().substring(0, 100),
            })).filter(l => l.href && l.href.includes('ranbazaar'));
        });

        console.log(`\nTotal links on homepage: ${links.length}`);
        const productLinks = links.filter(l => l.href.includes('product') || l.href.includes('/p/'));
        const categoryLinks = links.filter(l => !l.href.includes('product') && !l.href.includes('/p/') && !l.href.includes('#') && !l.href.endsWith('/'));
        console.log(`Product links: ${productLinks.length}`);
        console.log(`Category links: ${categoryLinks.length}`);

        // Extract from React/Bootstrap component - look for product data
        const reactData = await page.evaluate(() => {
            // Try to find React internal state
            const root = document.querySelector('#root');
            if (root && root.children.length > 0) {
                // Try to extract from the rendered DOM
                const cards = [];
                const cardElements = document.querySelectorAll('[class*="card"], [class*="product"], [class*="item"]');
                return {
                    cardCount: cardElements.length,
                    rootHTML: root.innerHTML.substring(0, 2000),
                };
            }
            return { message: 'No React root content found' };
        });

        console.log('\nReact data:', JSON.stringify(reactData, null, 2));

        // Try to find product pages by checking common patterns
        const testUrls = [
            'https://ranbazaar.com/product-list/',
            'https://ranbazaar.com/',
            'https://ranbazaar.com/cart',
        ];

        for (const testUrl of testUrls) {
            console.log(`\nFetching: ${testUrl}`);
            try {
                await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(3000);
                const content = await page.content();
                console.log(`  Status: ${content.substring(0, 200)}`);
            } catch (e) {
                console.log(`  Error: ${e.message}`);
            }
        }

        // Go back to homepage and look for all navigation
        await page.goto('https://ranbazaar.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(5000);

        // Extract all text content and structure
        const pageInfo = await page.evaluate(() => {
            const result = {
                title: document.title,
                allText: document.body.innerText.substring(0, 5000),
                allImages: Array.from(document.querySelectorAll('img')).map(img => ({
                    src: img.src,
                    alt: img.alt,
                })).slice(0, 20),
                allButtons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean),
                allH2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim()).filter(Boolean),
                allH3: Array.from(document.querySelectorAll('h3')).map(h => h.textContent?.trim()).filter(Boolean),
            };
            return result;
        });

        console.log('\n--- Page Info ---');
        console.log('Title:', pageInfo.title);
        console.log('H2s:', pageInfo.allH2);
        console.log('H3s:', pageInfo.allH3);
        console.log('Text (first 2000):', pageInfo.allText.substring(0, 2000));
        console.log('Images (first 5):', JSON.stringify(pageInfo.allImages.slice(0, 5), null, 2));

        // Now try to find products by looking at the DOM structure more carefully
        const productData = await page.evaluate(() => {
            // Try to find any JSON-LD structured data
            const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
            const jsonLd = Array.from(jsonLdScripts).map(s => {
                try { return JSON.parse(s.textContent); } catch(e) { return null; }
            }).filter(Boolean);

            // Look for any data attributes that might contain product info
            const dataAttrs = [];
            document.querySelectorAll('[data-product], [data-product-id], [data-product-id]').forEach(el => {
                dataAttrs.push({
                    tag: el.tagName,
                    attrs: Array.from(el.attributes).map(a => `${a.name}=${a.value}`).join(', '),
                    text: el.textContent?.trim().substring(0, 200),
                });
            });

            // Look for any inline JSON in script tags
            const scriptTexts = Array.from(document.querySelectorAll('script')).map(s => s.textContent).filter(t => t.includes('product') || t.includes('price') || t.includes('category'));
            const inlineProducts = scriptTexts.map(t => t.substring(0, 500)).slice(0, 5);

            return {
                jsonLd,
                dataAttrs: dataAttrs.slice(0, 20),
                inlineProducts,
            };
        });

        console.log('\n--- Product Data from DOM ---');
        console.log(JSON.stringify(productData, null, 2));

        // Try fetching specific API endpoints we know about from robots.txt
        const apiEndpoints = [
            'https://ranbazaar.com/api/product-list/',
            'https://ranbazaar.com/api/categories/',
            'https://ranbazaar.com/api/home/',
            'https://ranbazaar.com/api/banners/',
            'https://ranbazaar.com/api/search/',
            'https://ranbazaar.com/api/v1/products/',
            'https://ranbazaar.com/api/v2/products/',
            'https://ranbazaar.com/product/',
        ];

        const apiResults = {};
        for (const endpoint of apiEndpoints) {
            try {
                const res = await fetch(endpoint, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://ranbazaar.com/',
                    }
                });
                const text = await res.text();
                if (text && text !== 'No route for this path' && text !== '') {
                    console.log(`\n[${endpoint}] Status: ${res.status}`);
                    let json;
                    try { json = JSON.parse(text); } catch(e) { json = text.substring(0, 500); }
                    apiResults[endpoint] = { status: res.status, data: json };
                    console.log(`Response: ${JSON.stringify(json).substring(0, 500)}`);
                }
            } catch (e) {
                console.log(`[${endpoint}] Error: ${e.message}`);
            }
        }

        // Try some common category paths
        const categoryPaths = [
            'https://ranbazaar.com/api/categories/',
            'https://ranbazaar.com/categories/',
        ];

        for (const cp of categoryPaths) {
            try {
                const res = await fetch(cp, {
                    headers: {
                        'Accept': 'application/json,text/html',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    }
                });
                const text = await res.text();
                console.log(`\n[${cp}] Status: ${res.status}, Length: ${text.length}`);
                if (text.length < 1000) console.log(text);
                else console.log(text.substring(0, 1000));
            } catch (e) {
                console.log(`[${cp}] Error: ${e.message}`);
            }
        }

        // Compile final output
        const finalData = {
            site: 'https://ranbazaar.com',
            fetchedAt: new Date().toISOString(),
            siteInfo: {
                title: pageInfo.title,
                description: 'India\'s No. 1 site for customize kids products - name slips, custom pencils, notebooks, exam boards',
                platform: 'React SPA + Django REST API',
            },
            robots: await (await fetch('https://ranbazaar.com/robots.txt')).text(),
            apiCallsFound: uniqueApiCalls,
            links: links,
            productLinks,
            pageText: pageInfo.allText,
            apiResults,
            products: allProducts,
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log(`\n\nData saved to ${OUTPUT_FILE}`);
        console.log(`Total links found: ${links.length}`);
        console.log(`Total product links: ${productLinks.length}`);
        console.log(`Total API calls intercepted: ${uniqueApiCalls.length}`);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

main().catch(console.error);
