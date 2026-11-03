async function scenario(page) {
 const nav=name=>page.getByRole('button',{name,exact:true}).click();
 await nav('Ustawienia i kopie');
 await page.getByRole('combobox',{name:'Wielkość tekstu w całej aplikacji',exact:true}).selectOption('26');
 await nav('Zapisz ustawienia');
 await page.getByText('Ustawienia zapisane.',{exact:true}).waitFor();
 await page.getByText('Dodatkowe rodzaje ćwiczeń',{exact:true}).click();
 await page.setViewportSize({width:320,height:850});
 const offenders=await page.evaluate(()=>Array.from(document.querySelectorAll('*')).filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+1&&!['HTML','BODY'].includes(e.tagName)).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,55),scroll:e.scrollWidth,width:e.clientWidth})).slice(0,15));
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(JSON.stringify(offenders));
 await page.screenshot({path:'output/playwright/e2e-layout-320.png',fullPage:true});
 await nav('Dzisiaj');
 await page.getByText('Więcej możliwości',{exact:true}).click();
 await nav('Zacznij pisać');
 await page.getByRole('textbox',{name:'Twoje słowa',exact:true}).waitFor();
 const exercise=await page.evaluate(()=>Array.from(document.querySelectorAll('*')).filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+1&&!['HTML','BODY'].includes(e.tagName)).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,55),scroll:e.scrollWidth,width:e.clientWidth})).slice(0,15));
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(JSON.stringify(exercise));
 await page.screenshot({path:'output/playwright/e2e-layout-editor-320.png',fullPage:true});
 return 'LAYOUT_PASS';
}
