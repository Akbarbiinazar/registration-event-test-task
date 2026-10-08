import { expect, test } from '@playwright/test';

test('organizer creates an event; public and organizer pages show the same time', async ({
  page,
  context,
}) => {
  await page.goto('/events/new');
  await page.getByLabel('Название').fill('E2E meetup');
  await page.getByLabel('Описание').fill('hello');
  await page.getByLabel('Начало (в вашем часовом поясе)').fill('2030-05-10T18:00');
  await page.getByLabel('Количество мест').fill('3');
  await page.getByRole('button', { name: 'Создать' }).click();

  await expect(page.getByRole('heading', { name: /Событие создано/ })).toBeVisible();
  const links = await page.locator('section a').allTextContents();
  const [publicUrl, organizerUrl] = links;

  const pub = await context.newPage();
  await pub.goto(publicUrl as string);
  await expect(pub.getByText('18:00')).toBeVisible();
  await expect(pub.getByText('Осталось мест: 3')).toBeVisible();

  const org = await context.newPage();
  await org.goto(organizerUrl as string);
  await expect(org.getByText('18:00')).toBeVisible();
  await expect(org.getByText('Зарегистрировано: 0 из 3')).toBeVisible();
});

test('invalid form shows the API message', async ({ page }) => {
  await page.goto('/events/new');
  await page.getByLabel('Начало (в вашем часовом поясе)').fill('2030-05-10T18:00');
  await page.getByLabel('Количество мест').fill('0');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
