import { test, expect } from '@playwright/test';

test('login flow test', async ({ page, context }) => {
  // 1. [New Context] Create a new browser context (Done by Playwright by default for each test, but we can explicitly create one if needed)
  // Actually, Playwright's 'page' already comes from a fresh context.
  
  // 2. [Browser] Navigate to the homepage (path: /)
  // Since we don't know the exact URL, we'll use a placeholder or assume it's running on localhost:5173 (standard Vite port)
  // or localhost:3000. Often in these environments, it's 0.0.0.0 or localhost.
  // I'll check the dev script in ems-dashboard: "dev": "vite --config vite.config.ts --host 0.0.0.0"
  // Usually the proxy or the environment provides the URL. 
  // For the purpose of the test script, I'll use http://localhost:5173 as a likely candidate if it's running.
  // However, I'll use the baseURL if configured, or just '/' if we run it against a specific URL.
  
  const baseUrl = process.env.BASE_URL || 'http://localhost:5174';
  await page.goto(baseUrl);

  // 3. [Verify] Assert the login page is shown with a username field, password field, and login button ("Giriş Yap")
  // Using more robust selectors based on the Login.tsx content
  await expect(page.locator('h1')).toContainText('Enerji Yönetim Sistemi');
  const usernameInput = page.locator('input#username');
  const passwordInput = page.locator('input#password');
  const loginButton = page.getByRole('button', { name: 'Giriş Yap' });

  await expect(usernameInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(loginButton).toBeVisible();

  // 4. [Browser] Enter "admin" in the username (Kullanıcı Adı) field
  await usernameInput.fill('admin');

  // 5. [Browser] Enter "admin123" in the password (Şifre) field
  await passwordInput.fill('admin123');

  // 6. [Browser] Click the "Giriş Yap" (Login) button
  await loginButton.click();

  // 7. [Verify] 
  // - Assert the user is redirected away from the login page to the dashboard/main app
  // - Assert some dashboard content is visible (navigation, charts, or menu items)
  // - Assert no error messages are shown
  
  // Wait for navigation or a specific element that appears after login
  // We can also check if we are on dashboard path
  await expect(page).not.toHaveURL(/.*\/login.*/, { timeout: 10000 });
  
  // Wait for dashboard content. Based on the app's components, there's a sidebar/nav.
  // We'll look for text that indicates we are logged in, or a dashboard element.
  await expect(page.locator('text=Genel Bakış')).toBeVisible({ timeout: 10000 });
  
  // Assert no error messages are shown
  const errorMsg = page.locator('.text-destructive');
  await expect(errorMsg).not.toBeVisible();
});
