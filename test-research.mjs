import { chromium } from '/Users/hyj/PycharmProjects/deepseek-harness/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'
const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())})
await page.goto('http://127.0.0.1:3080/?token=Sd-JyD2mAhAAgrEfkwhA0iXtF7kN5BZdZJAW-oL4m_k',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(5000);
const cont=page.getByRole('button',{name:/Continue/i}); if(await cont.count()) await cont.first().click().catch(()=>{});
await page.waitForTimeout(800); await page.getByRole('button',{name:'Office',exact:true}).click(); await page.waitForTimeout(400);
await page.locator('[data-workbuddy-sub="research"]').click(); await page.waitForTimeout(2500);
const top=await page.evaluate(()=>document.body.innerText.slice(0,700));
const box=page.locator('[role="textbox"]').first(); await box.click(); await box.fill('请用 ego-browser 打开 https://example.com，读取页面内容并回答：页面标题是什么、主要讲什么。必须使用 ego-browser，不要用 web_fetch。'); await page.keyboard.press('Enter');
let text=''; for(let i=0;i<90;i++){ await page.waitForTimeout(5000); text=await page.evaluate(()=>document.body.innerText); const tail=text.slice(-5000); if(/Example Domain|ego-browser|结论/.test(tail) && !/Running|Deep diving/.test(tail.slice(-800))) break; if(/New session failed|Connection error|运行失败/.test(tail)) break; }
console.log(JSON.stringify({top,tail:text.slice(-5000),errors:errs.slice(0,10)},null,2)); await page.screenshot({path:'/tmp/research.png'}); await browser.close()
