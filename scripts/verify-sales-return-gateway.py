"""Read-only authenticated gateway regression checks against the running app.

Requires the managed preview session. Does not create or modify company data.
"""
import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await page.goto("http://localhost:8080")
        await page.evaluate(
            "([key, session]) => localStorage.setItem(key, session)",
            [os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"],
             os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]],
        )
        await page.reload()
        results = await page.evaluate("""async () => {
            const { supabase } = await import('/src/integrations/supabase/client.ts');
            const missing = '00000000-0000-0000-0000-000000000000';
            const post = await supabase.rpc('post_sales_return', {p_return_id: missing});
            const cancel = await supabase.rpc('cancel_sales_return', {p_return_id: missing});
            const catalog = await supabase.rpc('get_sales_product_catalog');
            return {
                postExists: !post.error && post.data?.success === false,
                cancelExists: !cancel.error && cancel.data?.success === false,
                catalogWorks: !catalog.error && catalog.data?.length > 0,
                catalogHidesCosts: !catalog.error && catalog.data.every(row =>
                    !('purchase_price' in row) && !('unit_cost' in row) && !('total_cost' in row))
            };
        }""")
        assert results["postExists"], "Posting gateway must reject missing documents cleanly"
        assert results["cancelExists"], "Cancellation gateway must reject missing documents cleanly"
        assert results["catalogWorks"], "Sales product catalog must load real products"
        assert results["catalogHidesCosts"], "Sales catalog must not expose purchase or stock costs"
        print("4 authenticated gateway checks passed; no company data changed")
        await browser.close()


asyncio.run(main())