import { expect, test, type Page } from "@playwright/test";

type Lot = {
  id: string;
  title: string;
  authors: string[];
  status: string;
  bidCount: number;
  coverUrl: string | null;
  effectiveEndsAt: string;
  serverNow: string;
};

test.describe.configure({ mode: "serial" });

async function readLots(page: Page) {
  const response = await page.request.get("/api/lots?limit=50");
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { data: Lot[] }).data;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Demo1234!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Login realizado" })
  ).toBeVisible();
}

function auctionDateTime(value: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
}

test("vitrine, sala e auditoria públicas usam dados reais do E2E", async ({
  page
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Livros em leilão." })
  ).toBeVisible();
  await expect(page.locator(".lot-card").first()).toBeVisible();
  expect(await page.locator(".lot-card").count()).toBeGreaterThanOrEqual(3);

  const lots = await readLots(page);
  const fixture = lots.find(
    (lot) => lot.title === "The Lightning Thief" && lot.bidCount === 1
  );
  expect(fixture, "fixture pública com lance e capa ausente").toBeTruthy();

  await page.goto(`/lots/${fixture!.id}`);
  await expect(
    page.getByRole("heading", { name: fixture!.title })
  ).toBeVisible();
  const cover = page.locator(".detail-cover img");
  await expect(cover).toBeVisible();
  await expect
    .poll(() =>
      cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBeGreaterThan(0);
  expect(await cover.evaluate((image) => getComputedStyle(image).objectFit)).toBe(
    "contain"
  );

  await page.getByRole("link", { name: /Auditar historico/ }).click();
  await expect(
    page.getByRole("heading", { name: "Auditoria de lances" })
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Historico integro" })
  ).toBeVisible();
  await expect(page.getByText("Lances verificados").locator("..")).toContainText(
    "1"
  );
  await expect(page.locator("body")).not.toContainText("@casadeleiloes.local");
});

test("licitante consulta carteira, arremates e comprovante público", async ({
  page
}) => {
  await login(page, "licitante2@casadeleiloes.local");
  await page.goto("/wallet");
  await expect(
    page.getByRole("heading", { name: "Minha carteira" })
  ).toBeVisible();
  await expect(page.getByText("Saldo comprometido")).toBeVisible();
  await expect(page.locator(".wallet-transaction-debit").first()).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.goto("/my-auctions");
  await expect(
    page.getByRole("heading", { name: "Meus arremates" })
  ).toBeVisible();
  const receiptLink = page.getByRole("link", { name: /Comprovante/ }).first();
  await expect(receiptLink).toBeVisible();
  await receiptLink.click();
  await expect(
    page.getByRole("heading", { name: "Lote arrematado" })
  ).toBeVisible();
  await expect(page.locator(".receipt-total .money-large")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "licitante2@casadeleiloes.local"
  );
  await expect(page.locator("body")).not.toContainText("Bruno Licitante");

  const publicUrl = page.url();
  await page.context().clearCookies();
  await page.goto(publicUrl);
  await expect(
    page.getByRole("heading", { name: "Lote arrematado" })
  ).toBeVisible();
});

test("leiloeiro pesquisa no stub e publica lote com capa armazenada", async ({
  page
}) => {
  await login(page, "leiloeiro@casadeleiloes.local");
  await page.goto("/auctioneer/lots/new");
  await expect(
    page.getByRole("heading", { name: "Criar novo lote" })
  ).toBeVisible();

  await page.getByLabel("Título ou autor").fill("Machado de Assis");
  await page.getByRole("button", { name: /Buscar/ }).click();
  const result = page.locator(".catalog-item").first();
  await expect(result).toContainText("Resultado E2E: Machado de Assis");
  await result.click();

  await page
    .getByLabel("Descrição do exemplar")
    .fill("Exemplar E2E em excelente estado de conservação.");
  await page.getByLabel("Lance inicial").fill("10000");
  await page.getByLabel("Incremento mínimo").fill("500");
  const end = auctionDateTime(new Date(Date.now() + 3 * 60 * 60_000));
  await page.getByLabel("Data de término").fill(end.date);
  await page.getByLabel("Horário de término").fill(end.time);

  const publish = page.getByRole("button", { name: "Publicar lote" });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page).toHaveURL(/\/lots\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Lote publicado" })
  ).toBeVisible();

  const lotId = page.url().split("/").at(-1)!;
  const detailResponse = await page.request.get(`/api/lots/${lotId}`);
  expect(detailResponse.ok()).toBe(true);
  const created = ((await detailResponse.json()) as { data: Lot }).data;
  expect(created.title).toBe("Resultado E2E: Machado de Assis");
  expect(created.status).toBe("LIVE");
  expect(created.coverUrl).toMatch(/^\/api\/covers\/.+\.png$/);
  const coverResponse = await page.request.get(created.coverUrl!);
  expect(coverResponse.ok()).toBe(true);
  expect(coverResponse.headers()["content-type"]).toContain("image/png");
});

test("paginação solicita e apresenta a página selecionada", async ({ page }) => {
  const realResponse = await page.request.get("/api/lots?page=1&limit=1");
  expect(realResponse.ok()).toBe(true);
  const realBody = (await realResponse.json()) as {
    data: Array<Record<string, unknown>>;
  };
  const baseLot = realBody.data[0];
  expect(baseLot).toBeTruthy();

  await page.route("**/api/lots?*", async (route) => {
    const requestedPage = Number(
      new URL(route.request().url()).searchParams.get("page") ?? "1"
    );
    const count = requestedPage === 1 ? 12 : 1;
    const data = Array.from({ length: count }, (_, index) => {
      const position = requestedPage === 1 ? index + 1 : 13;
      return {
        ...baseLot,
        id: `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
        title: `Livro paginado ${position}`
      };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data,
        meta: { page: requestedPage, limit: 12, total: 13, totalPages: 2 }
      })
    });
  });

  await page.goto("/");
  await expect(page.locator(".lot-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Página 2" }).click();
  await expect(
    page.getByRole("heading", { name: "Livro paginado 13" })
  ).toBeVisible();
  await expect(page.locator(".lot-card")).toHaveCount(1);
});

test("layout móvel preserva navegação, capas e sala sem overflow", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Vitrine" })
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);

  const lots = await readLots(page);
  const fixture = lots.find(
    (lot) => lot.status === "LIVE" && lot.coverUrl !== null
  );
  expect(fixture, "fixture mobile com capa ausente").toBeTruthy();
  await page.goto(`/lots/${fixture!.id}`);
  await expect(
    page.getByRole("heading", { name: fixture!.title })
  ).toBeVisible();
  const coverContainer = page.locator(".detail-cover");
  const cover = coverContainer.locator("img");
  await expect(cover).toBeVisible();
  const containerBox = await coverContainer.boundingBox();
  const imageBox = await cover.boundingBox();
  expect(containerBox).not.toBeNull();
  expect(imageBox).not.toBeNull();
  expect(containerBox!.height).toBeLessThanOrEqual(280);
  expect(imageBox!.width).toBeLessThanOrEqual(containerBox!.width + 1);
  expect(imageBox!.height).toBeLessThanOrEqual(containerBox!.height + 1);
  expect(await cover.evaluate((image) => getComputedStyle(image).objectFit)).toBe(
    "contain"
  );
  await assertNoHorizontalOverflow(page);
});
