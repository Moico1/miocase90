import './style.css';

import {
  fetchFeedPage,
  fetchListingDetail,
  fetchPublicStore,
  fetchStoreListings,
  fetchStoreReviews,
  getCachedCategories,
  getCachedFeaturedStores,
  isSupabaseConfigured,
  type Category,
  type FeedCursor,
  type FeaturedStore,
  type ListingDetail,
  type ProductCard,
  type PublicStore,
  type SortOrder,
  type StoreReview,
} from './data';

const appElement = document.querySelector<HTMLElement>('#app');
if (!appElement) throw new Error('No se encontró el contenedor principal.');
const app: HTMLElement = appElement;

const apkUrl = readHttpsUrl(import.meta.env.VITE_APK_URL);
const appVersion = import.meta.env.VITE_APP_VERSION?.trim() ?? '';
const supportEmail = readSupportEmail(import.meta.env.VITE_SUPPORT_EMAIL);

let routeVersion = 0;
let feedRequestVersion = 0;
let homeFeed: HTMLElement | null = null;
let homeCategories: HTMLElement | null = null;
let homeStores: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let searchTimer = 0;

const feedState: {
  searchText: string;
  categoryId: number | null;
  sortOrder: SortOrder;
  items: ProductCard[];
  cursor: FeedCursor | null;
  loading: boolean;
  error: string | null;
} = {
  searchText: '',
  categoryId: null,
  sortOrder: 'recent',
  items: [],
  cursor: null,
  loading: false,
  error: null,
};

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function link(label: string, href: string, className = ''): HTMLAnchorElement {
  const result = node('a', className, label);
  result.href = href;
  return result;
}

function button(
  label: string,
  onClick: () => void,
  className = 'button button--secondary'
): HTMLButtonElement {
  const result = node('button', className, label);
  result.type = 'button';
  result.addEventListener('click', onClick);
  return result;
}

function readHttpsUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function readSupportEmail(value: string | undefined): string | null {
  const email = value?.trim() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function displayPrice(price: number, currency: ProductCard['currency']): string {
  const amount = new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
  return `${currency === 'BOB' ? 'Bs' : currency} ${amount}`;
}

function dateLabel(dateValue: string): string {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-BO', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function safeText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function createImage(
  src: string | null,
  alt: string,
  className: string,
  fallbackLabel = 'Foto no disponible'
): HTMLElement {
  const frame = node('div', `${className} image-frame`);
  if (!src) {
    frame.append(node('span', 'image-fallback', fallbackLabel));
    return frame;
  }
  const image = node('img', 'image-frame__image');
  image.src = src;
  image.alt = alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener(
    'error',
    () => {
      frame.replaceChildren(node('span', 'image-fallback', fallbackLabel));
    },
    { once: true }
  );
  frame.append(image);
  return frame;
}

function storeAvatar(url: string | null, name: string, className = 'store-avatar'): HTMLElement {
  if (url) return createImage(url, `Logo de ${name}`, `${className} store-avatar--image`, 'Logo no disponible');
  const avatar = node('span', className, name.trim().charAt(0).toUpperCase() || 'T');
  avatar.setAttribute('aria-label', `Tienda ${name}`);
  return avatar;
}

function createHeader(): HTMLElement {
  const header = node('header', 'site-header');
  const row = node('div', 'site-header__row page-width');
  const brand = link('', '#/', 'brand-lockup');
  const logo = node('img', 'brand-lockup__logo');
  logo.src = '/logo.svg';
  logo.alt = 'Mío CASE';
  brand.append(logo);
  const brandText = node('span', 'brand-lockup__text');
  brandText.append(
    node('span', 'brand-lockup__name', 'Mío CASE'),
    node('span', 'brand-lockup__tagline', 'Bueno, bonito, barato')
  );
  brand.append(brandText);

  const location = node('span', 'location-chip', 'Yacuiba, BO');
  location.setAttribute('aria-label', 'Ubicación: Yacuiba, Bolivia');
  const nav = node('nav', 'site-nav');
  nav.setAttribute('aria-label', 'Navegación principal');
  nav.append(
    link('Explorar', '#/', 'site-nav__link'),
    link('Vende con nosotros', '#/vende', 'site-nav__link'),
    downloadLink('Descargar app', 'button button--primary button--small')
  );
  row.append(brand, location, nav);
  header.append(row, node('div', 'tricolor-bar'));
  return header;
}

function createFooter(): HTMLElement {
  const footer = node('footer', 'site-footer');
  const content = node('div', 'site-footer__inner page-width');
  const brand = node('div', 'site-footer__brand');
  brand.append(
    node('strong', 'site-footer__name', 'Mío CASE'),
    node('span', '', 'Hecho en Yacuiba')
  );
  const nav = node('nav', 'site-footer__links');
  nav.setAttribute('aria-label', 'Enlaces del pie de página');
  nav.append(
    link('Vende con nosotros', '#/vende'),
    link('Términos', '#/terminos'),
    link('Privacidad', '#/privacidad')
  );
  if (supportEmail) {
    const email = link(supportEmail, `mailto:${supportEmail}`);
    email.setAttribute('aria-label', `Correo de soporte: ${supportEmail}`);
    nav.append(email);
  } else {
    nav.append(node('span', 'site-footer__support-missing', 'Correo de soporte por configurar'));
  }
  content.append(brand, nav);
  footer.append(content);
  return footer;
}

function downloadLink(label: string, className: string): HTMLAnchorElement {
  if (!apkUrl) {
    const unavailable = link('Próximamente', '#/vende', `${className} is-unavailable`);
    unavailable.setAttribute('aria-label', 'Descarga para Android próximamente');
    return unavailable;
  }
  const download = link(label, apkUrl, className);
  download.target = '_blank';
  download.rel = 'noopener noreferrer';
  download.setAttribute('aria-label', `${label} (Android APK)`);
  return download;
}

function pageTitle(title: string, subtitle?: string): HTMLElement {
  const header = node('header', 'page-heading');
  header.append(node('h1', 'page-title', title));
  if (subtitle) header.append(node('p', 'page-subtitle', subtitle));
  return header;
}

function statusPanel(
  title: string,
  message: string,
  actionLabel?: string,
  onAction?: () => void
): HTMLElement {
  const panel = node('section', 'status-panel');
  panel.setAttribute('role', 'status');
  panel.append(
    node('span', 'status-panel__icon', 'M'),
    node('h2', 'status-panel__title', title),
    node('p', 'status-panel__message', message)
  );
  if (actionLabel && onAction) panel.append(button(actionLabel, onAction, 'button button--secondary'));
  return panel;
}

function renderSkeletonGrid(target: HTMLElement, count = 8): void {
  const grid = node('div', 'product-grid');
  for (let index = 0; index < count; index += 1) {
    const card = node('div', 'skeleton-card');
    card.setAttribute('aria-hidden', 'true');
    card.append(
      node('div', 'skeleton-card__photo'),
      node('div', 'skeleton-card__line skeleton-card__line--price'),
      node('div', 'skeleton-card__line'),
      node('div', 'skeleton-card__line skeleton-card__line--short')
    );
    grid.append(card);
  }
  target.replaceChildren(grid);
}

function pageSkeleton(label: string): HTMLElement {
  const skeleton = node('section', 'page-skeleton');
  skeleton.setAttribute('role', 'status');
  skeleton.setAttribute('aria-label', label);
  const media = node('div', 'page-skeleton__media');
  media.setAttribute('aria-hidden', 'true');
  const content = node('div', 'page-skeleton__content');
  content.setAttribute('aria-hidden', 'true');
  content.append(
    node('div', 'page-skeleton__line page-skeleton__line--short'),
    node('div', 'page-skeleton__line page-skeleton__line--title'),
    node('div', 'page-skeleton__line'),
    node('div', 'page-skeleton__line page-skeleton__line--medium')
  );
  skeleton.append(media, content);
  return skeleton;
}

function makeBadge(label: string, variant: 'new' | 'discount' | 'sold'): HTMLElement {
  return node('span', `badge badge--${variant}`, label);
}

function productCard(product: ProductCard): HTMLElement {
  const card = node('article', 'product-card');
  const productLink = link('', `#/producto/${encodeURIComponent(product.id)}`, 'product-card__main');
  const photo = createImage(
    product.thumbnailUrl,
    `Foto de ${product.title}`,
    'product-card__photo',
    'Foto no disponible'
  );
  const badges = node('span', 'product-card__badges');
  if (product.isNew) badges.append(makeBadge('Nuevo', 'new'));
  if (product.previousPrice !== null && product.previousPrice > product.price) {
    badges.append(makeBadge('Oferta', 'discount'));
  }
  if (product.status === 'sold') badges.append(makeBadge('Vendido', 'sold'));
  photo.append(badges);

  const body = node('div', 'product-card__body');
  body.append(
    node('p', 'product-card__price', displayPrice(product.price, product.currency)),
    node('h3', 'product-card__title', product.title)
  );
  productLink.append(photo, body);
  card.append(productLink);

  const storeRow = node('div', 'product-card__store');
  if (product.storeId) {
    const storeLink = link('', `#/tienda/${encodeURIComponent(product.storeId)}`, 'product-card__store-link');
    storeLink.append(storeAvatar(product.storeLogoUrl, product.storeName, 'store-avatar store-avatar--tiny'));
    storeLink.append(node('span', 'product-card__store-name', product.storeName));
    storeRow.append(storeLink);
  } else {
    storeRow.append(
      storeAvatar(product.storeLogoUrl, product.storeName, 'store-avatar store-avatar--tiny'),
      node('span', 'product-card__store-name', product.storeName)
    );
  }
  card.append(storeRow);
  return card;
}

function renderHome(): HTMLElement {
  const page = node('main', 'home-page page-width');
  const hero = node('section', 'home-hero');
  const heroCopy = node('div', 'home-hero__copy');
  heroCopy.append(
    node('p', 'eyebrow', 'El mercado de tu comunidad'),
    node('h1', 'home-hero__title', 'Encuentra tu próxima oferta'),
    node('p', 'home-hero__text', 'Productos y tiendas locales, todo en un solo lugar.')
  );
  hero.append(heroCopy);

  const searchForm = node('form', 'search-form');
  searchForm.setAttribute('role', 'search');
  searchInput = node('input', 'search-form__input');
  searchInput.type = 'search';
  searchInput.placeholder = '¿Qué estás buscando?';
  searchInput.value = feedState.searchText;
  searchInput.setAttribute('aria-label', 'Buscar productos');
  searchInput.addEventListener('input', () => {
    feedState.searchText = searchInput?.value ?? '';
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      void loadFeed(true);
    }, 350);
  });
  const searchButton = node('button', 'search-form__submit', 'Buscar');
  searchButton.type = 'submit';
  const searchIcon = node('span', 'search-form__icon', '⌕');
  searchIcon.setAttribute('aria-hidden', 'true');
  searchForm.append(searchIcon, searchInput, searchButton);
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    feedState.searchText = searchInput?.value ?? '';
    void loadFeed(true);
  });
  hero.append(searchForm);
  page.append(hero);

  const categoriesSection = node('section', 'feed-filters');
  categoriesSection.append(
    node('h2', 'section-title section-title--small', 'Categorías'),
  );
  homeCategories = node('div', 'chip-row');
  homeCategories.setAttribute('aria-label', 'Filtrar por categoría');
  categoriesSection.append(homeCategories);
  const sortRow = node('div', 'sort-row');
  sortRow.append(node('label', 'sort-row__label', 'Ordenar por'));
  const sortSelect = node('select', 'sort-row__select');
  sortSelect.setAttribute('aria-label', 'Ordenar publicaciones');
  const recent = node('option', '', 'Más reciente');
  recent.value = 'recent';
  const cheapest = node('option', '', 'Más barato');
  cheapest.value = 'cheapest';
  sortSelect.append(recent, cheapest);
  sortSelect.value = feedState.sortOrder;
  sortSelect.addEventListener('change', () => {
    feedState.sortOrder = sortSelect.value === 'cheapest' ? 'cheapest' : 'recent';
    void loadFeed(true);
  });
  sortRow.append(sortSelect);
  categoriesSection.append(sortRow);
  page.append(categoriesSection);

  const featuredSection = node('section', 'featured-section');
  featuredSection.append(node('div', 'section-heading'));
  const featuredHeader = featuredSection.querySelector('.section-heading');
  if (featuredHeader) {
    featuredHeader.append(node('h2', 'section-title', 'Tiendas destacadas'));
  }
  homeStores = node('div', 'featured-stores');
  featuredSection.append(homeStores);
  page.append(featuredSection);

  const listingsSection = node('section', 'listings-section');
  listingsSection.append(node('div', 'section-heading'));
  const listingHeader = listingsSection.querySelector('.section-heading');
  if (listingHeader) listingHeader.append(node('h2', 'section-title', 'Ofertas para ti'));
  homeFeed = node('div', 'feed-results');
  listingsSection.append(homeFeed);
  page.append(listingsSection);

  const vendeCard = node('section', 'home-seller-callout');
  vendeCard.append(
    node('div', 'home-seller-callout__copy'),
    link('Conoce cómo vender', '#/vende', 'button button--secondary')
  );
  const sellerCopy = vendeCard.querySelector('.home-seller-callout__copy');
  if (sellerCopy) {
    sellerCopy.append(
      node('p', 'eyebrow', '¿Tienes algo para vender?'),
      node('h2', 'section-title', 'Tu tienda también puede estar aquí'),
      node('p', 'body-copy', 'Publica desde la app y llega a más personas de Yacuiba.')
    );
  }
  page.append(vendeCard);

  renderCategoryButtons([]);
  renderSkeletonGrid(homeFeed);
  if (!isSupabaseConfigured()) {
    homeFeed.replaceChildren(
      statusPanel(
        'Catálogo no disponible',
        'La conexión pública aún no está configurada. Vuelve a intentarlo más tarde.'
      )
    );
    homeCategories?.replaceChildren(node('span', 'muted-copy', 'Categorías próximamente.'));
    homeStores?.replaceChildren(node('span', 'muted-copy', 'Tiendas destacadas próximamente.'));
  } else {
    const currentRoute = routeVersion;
    void loadCategories(currentRoute);
    void loadFeaturedStores(currentRoute);
    void loadFeed(true, currentRoute);
  }
  return page;
}

function renderCategoryButtons(categories: Category[]): void {
  if (!homeCategories) return;
  const allButton = button(
    'Todas',
    () => {
      feedState.categoryId = null;
      renderCategoryButtons(categories);
      void loadFeed(true);
    },
    `category-chip${feedState.categoryId === null ? ' is-selected' : ''}`
  );
  homeCategories.replaceChildren(allButton);
  categories.forEach((category) => {
    const categoryButton = button(
      category.name,
      () => {
        feedState.categoryId = category.id;
        renderCategoryButtons(categories);
        void loadFeed(true);
      },
      `category-chip${feedState.categoryId === category.id ? ' is-selected' : ''}`
    );
    homeCategories?.append(categoryButton);
  });
}

async function loadCategories(expectedRoute: number): Promise<void> {
  if (!homeCategories || expectedRoute !== routeVersion) return;
  homeCategories.replaceChildren(node('span', 'muted-copy', 'Cargando categorías…'));
  try {
    const categories = await getCachedCategories();
    if (expectedRoute !== routeVersion) return;
    renderCategoryButtons(categories);
  } catch {
    if (expectedRoute !== routeVersion || !homeCategories) return;
    homeCategories.replaceChildren(
      node('span', 'inline-error', 'No se pudieron cargar las categorías.'),
      button('Reintentar', () => void loadCategories(expectedRoute), 'text-button')
    );
  }
}

function renderFeaturedStores(stores: FeaturedStore[]): void {
  if (!homeStores) return;
  if (stores.length === 0) {
    homeStores.replaceChildren(
      node('p', 'muted-copy', 'Pronto verás aquí tiendas locales destacadas.')
    );
    return;
  }
  const list = node('div', 'featured-stores__list');
  stores.forEach((store) => {
    const card = link('', `#/tienda/${encodeURIComponent(store.id)}`, 'featured-store');
    const avatar = storeAvatar(store.logoUrl, store.name);
    const verified = node('span', 'verified-mark', '✓');
    verified.setAttribute('aria-label', 'Vendedor verificado');
    avatar.append(verified);
    card.append(
      avatar,
      node('span', 'featured-store__name', store.name),
      node('span', 'featured-store__rating', `★ ${store.ratingAverage.toFixed(1)} · ${store.reviewCount}`)
    );
    list.append(card);
  });
  homeStores.replaceChildren(list);
}

async function loadFeaturedStores(expectedRoute: number): Promise<void> {
  if (!homeStores || expectedRoute !== routeVersion) return;
  homeStores.replaceChildren(node('span', 'muted-copy', 'Cargando tiendas…'));
  try {
    renderFeaturedStores(await getCachedFeaturedStores());
  } catch {
    if (expectedRoute !== routeVersion || !homeStores) return;
    homeStores.replaceChildren(
      node('span', 'inline-error', 'No se pudieron cargar las tiendas.'),
      button('Reintentar', () => void loadFeaturedStores(expectedRoute), 'text-button')
    );
  }
}

async function loadFeed(reset: boolean, expectedRoute = routeVersion): Promise<void> {
  if (!homeFeed || expectedRoute !== routeVersion || (feedState.loading && !reset)) return;
  if (!isSupabaseConfigured()) return;
  if (reset) {
    feedState.items = [];
    feedState.cursor = null;
    feedState.error = null;
  }
  const requestId = ++feedRequestVersion;
  feedState.loading = true;
  if (feedState.items.length === 0) renderSkeletonGrid(homeFeed);
  try {
    const page = await fetchFeedPage({
      searchText: feedState.searchText,
      categoryId: feedState.categoryId,
      cursor: reset ? null : feedState.cursor,
      sortOrder: feedState.sortOrder,
    });
    if (expectedRoute !== routeVersion || requestId !== feedRequestVersion) return;
    feedState.items = reset ? page.items : [...feedState.items, ...page.items];
    feedState.cursor = page.nextCursor;
    feedState.error = null;
    feedState.loading = false;
    renderFeedResults();
  } catch {
    if (expectedRoute !== routeVersion || requestId !== feedRequestVersion) return;
    feedState.error = 'No se pudieron cargar las publicaciones. Comprueba tu conexión e inténtalo otra vez.';
    renderFeedResults();
  } finally {
    if (requestId === feedRequestVersion) feedState.loading = false;
  }
}

function renderFeedResults(): void {
  if (!homeFeed) return;
  if (feedState.error && feedState.items.length === 0) {
    homeFeed.replaceChildren(
      statusPanel('No se cargaron las ofertas', feedState.error, 'Reintentar', () => {
        void loadFeed(true);
      })
    );
    return;
  }
  if (feedState.items.length === 0 && !feedState.loading) {
    homeFeed.replaceChildren(
      statusPanel(
        'No encontramos productos',
        'Prueba con otra búsqueda o elige una categoría diferente.'
      )
    );
    return;
  }
  const grid = node('div', 'product-grid');
  feedState.items.forEach((item) => grid.append(productCard(item)));
  homeFeed.replaceChildren(grid);
  if (feedState.error) {
    homeFeed.append(
      node('p', 'inline-error', feedState.error),
      button('Reintentar', () => void loadFeed(false), 'button button--secondary')
    );
  } else if (feedState.cursor) {
    homeFeed.append(
      button('Ver más', () => void loadFeed(false), 'button button--secondary load-more')
    );
  }
}

function renderProductPage(id: string): HTMLElement {
  const page = node('main', 'page-width content-page');
  page.append(link('← Volver a explorar', '#/', 'back-link'));
  page.append(pageSkeleton('Cargando publicación'));
  const currentRoute = routeVersion;
  if (!isUuid(id) || !isSupabaseConfigured()) {
    page.replaceChildren(
      link('← Volver a explorar', '#/', 'back-link'),
      statusPanel('Publicación no disponible', 'No encontramos esta publicación.')
    );
    return page;
  }
  void fetchListingDetail(id)
    .then((listing) => {
      if (currentRoute !== routeVersion) return;
      page.replaceChildren(link('← Volver a explorar', '#/', 'back-link'));
      if (!listing) {
        page.append(statusPanel('Publicación no disponible', 'Puede que ya no esté disponible.'));
        return;
      }
      page.append(renderListingDetail(listing));
    })
    .catch(() => {
      if (currentRoute !== routeVersion) return;
      page.replaceChildren(
        link('← Volver a explorar', '#/', 'back-link'),
        statusPanel('No se pudo cargar la publicación', 'Comprueba tu conexión e inténtalo otra vez.', 'Reintentar', () => {
          renderCurrentRoute();
        })
      );
    });
  return page;
}

function renderListingDetail(listing: ListingDetail): HTMLElement {
  const layout = node('article', 'detail-layout');
  const mainColumn = node('div', 'detail-layout__main');
  const gallery = node('div', 'photo-gallery');
  gallery.setAttribute('aria-label', `Fotos de ${listing.title}`);
  if (listing.photos.length === 0) {
    gallery.append(createImage(null, `Foto de ${listing.title}`, 'photo-gallery__photo'));
  } else {
    listing.photos.forEach((photo, index) => {
      const image = createImage(
        photo.url,
        `${listing.title}, foto ${index + 1}`,
        'photo-gallery__photo',
        'Foto no disponible'
      );
      gallery.append(image);
    });
  }
  mainColumn.append(gallery);
  const facts = node('section', 'detail-facts');
  if (listing.status === 'sold') facts.append(makeBadge('Vendido', 'sold'));
  if (listing.isNew) facts.append(makeBadge('Nuevo', 'new'));
  if (listing.previousPrice !== null && listing.previousPrice > listing.price) {
    facts.append(makeBadge('Oferta', 'discount'));
  }
  facts.append(
    node('p', 'detail-price', displayPrice(listing.price, listing.currency)),
    node('h1', 'detail-title', listing.title)
  );
  if (listing.categoryName) facts.append(node('span', 'detail-category', listing.categoryName));
  facts.append(
    node('h2', 'detail-section-title', 'Descripción'),
    node('p', 'detail-description', safeText(listing.description, 'El vendedor no agregó una descripción.'))
  );
  mainColumn.append(facts);

  const sideColumn = node('aside', 'detail-layout__aside');
  const storeCard = node('section', 'store-card');
  storeCard.append(node('h2', 'detail-section-title', 'Tienda'));
  if (listing.storeId) {
    const storeLink = link('', `#/tienda/${encodeURIComponent(listing.storeId)}`, 'store-card__identity');
    storeLink.append(
      storeAvatar(listing.storeLogoUrl, listing.storeName, 'store-avatar store-avatar--large'),
      node('span', 'store-card__name', listing.storeName)
    );
    storeCard.append(storeLink);
  } else {
    storeCard.append(node('p', 'body-copy', listing.storeName));
  }
  storeCard.append(
    node('div', 'safety-notice'),
    node('h2', 'detail-section-title', '¿Te interesa?'),
    node('p', 'body-copy', 'Descarga la app para contactar al vendedor.')
  );
  const safety = storeCard.querySelector('.safety-notice');
  if (safety) {
    safety.append(
      createShieldIcon(),
      node('p', 'safety-notice__text', 'No pagues por adelantado. Reúnete en lugares públicos.')
    );
  }
  storeCard.append(downloadLink('Descargar la app', 'button button--primary button--wide'));
  if (!apkUrl) storeCard.append(node('p', 'muted-copy', 'La descarga para Android estará disponible próximamente.'));
  sideColumn.append(storeCard);
  layout.append(mainColumn, sideColumn);
  return layout;
}

function createShieldIcon(): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('class', 'safety-notice__icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const shield = document.createElementNS(namespace, 'path');
  shield.setAttribute('d', 'M12 2.5 20 6v5.5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3.5Z');
  shield.setAttribute('fill', 'none');
  shield.setAttribute('stroke', 'currentColor');
  shield.setAttribute('stroke-width', '1.8');
  shield.setAttribute('stroke-linejoin', 'round');
  const check = document.createElementNS(namespace, 'path');
  check.setAttribute('d', 'm8.5 12 2.2 2.2 4.8-4.8');
  check.setAttribute('fill', 'none');
  check.setAttribute('stroke', 'currentColor');
  check.setAttribute('stroke-width', '1.8');
  check.setAttribute('stroke-linecap', 'round');
  check.setAttribute('stroke-linejoin', 'round');
  icon.append(shield, check);
  return icon;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function renderStorePage(id: string): HTMLElement {
  const page = node('main', 'page-width content-page');
  page.append(link('← Volver a explorar', '#/', 'back-link'));
  const currentRoute = routeVersion;
  if (!isUuid(id) || !isSupabaseConfigured()) {
    page.append(statusPanel('Tienda no disponible', 'No encontramos esta tienda.'));
    return page;
  }
  page.append(pageSkeleton('Cargando tienda'));
  void loadStorePage(page, id, currentRoute);
  return page;
}

async function loadStorePage(page: HTMLElement, id: string, expectedRoute: number): Promise<void> {
  try {
    const store = await fetchPublicStore(id);
    if (expectedRoute !== routeVersion) return;
    if (!store) {
      page.replaceChildren(
        link('← Volver a explorar', '#/', 'back-link'),
        statusPanel('Tienda no disponible', 'La tienda no está disponible públicamente.')
      );
      return;
    }
    const [products, reviews] = await Promise.all([
      fetchStoreListings(store.id, store.name),
      fetchStoreReviews(store.id),
    ]);
    if (expectedRoute !== routeVersion) return;
    page.replaceChildren(
      link('← Volver a explorar', '#/', 'back-link'),
      renderStoreDetails(store, products, reviews)
    );
  } catch {
    if (expectedRoute !== routeVersion) return;
    page.replaceChildren(
      link('← Volver a explorar', '#/', 'back-link'),
      statusPanel('No se pudo cargar la tienda', 'Comprueba tu conexión e inténtalo otra vez.', 'Reintentar', () => {
        renderCurrentRoute();
      })
    );
  }
}

function renderStoreDetails(
  store: PublicStore,
  products: ProductCard[],
  reviews: StoreReview[]
): HTMLElement {
  const page = node('article', 'store-page');
  const cover = node('div', 'store-cover');
  cover.setAttribute('aria-hidden', 'true');
  const profile = node('header', 'store-profile');
  const avatar = storeAvatar(store.logoUrl, store.name, 'store-avatar store-avatar--profile');
  const verified = node('span', 'verified-mark verified-mark--profile', '✓ Vendedor verificado');
  verified.setAttribute('aria-label', 'Vendedor verificado');
  avatar.append(verified);
  profile.append(
    avatar,
    node('h1', 'page-title', store.name),
    node('p', 'store-rating', `★ ${store.ratingAverage.toFixed(1)} · ${store.reviewCount} reseñas`),
    node('p', 'store-profile__since', `Miembro desde ${dateLabel(store.memberSince)}`)
  );
  const details = node('section', 'store-details');
  details.append(
    infoBlock('Barrio', store.neighborhood),
    infoBlock('Horario', safeText(store.openingHours, 'Horario no especificado'))
  );
  if (store.description) details.append(infoBlock('Sobre la tienda', store.description));
  page.append(cover, profile, details);

  const productsSection = node('section', 'store-listings');
  productsSection.append(node('h2', 'section-title', 'Productos'));
  if (products.length === 0) {
    productsSection.append(statusPanel('Todavía no hay productos', 'Cuando la tienda publique productos, aparecerán aquí.'));
  } else {
    const grid = node('div', 'product-grid');
    products.forEach((product) => grid.append(productCard(product)));
    productsSection.append(grid);
  }
  page.append(productsSection);

  const reviewsSection = node('section', 'store-reviews');
  reviewsSection.append(node('h2', 'section-title', 'Reseñas'));
  if (reviews.length === 0) {
    reviewsSection.append(statusPanel('Aún no hay reseñas', 'Las opiniones de la comunidad aparecerán aquí.'));
  } else {
    const list = node('div', 'review-list');
    reviews.forEach((review) => list.append(reviewCard(review)));
    reviewsSection.append(list);
  }
  page.append(reviewsSection);
  return page;
}

function infoBlock(title: string, value: string): HTMLElement {
  const block = node('div', 'info-block');
  block.append(node('h2', 'info-block__title', title), node('p', 'body-copy', value));
  return block;
}

function reviewCard(review: StoreReview): HTMLElement {
  const card = node('article', 'review-card');
  const top = node('div', 'review-card__top');
  top.append(
    node('strong', '', review.reviewerName),
    node('span', 'review-card__rating', `${'★'.repeat(Math.max(0, Math.min(5, review.rating)))}${'☆'.repeat(Math.max(0, 5 - review.rating))}`)
  );
  card.append(top);
  if (review.comment) card.append(node('p', 'body-copy', review.comment));
  card.append(node('time', 'review-card__date', dateLabel(review.createdAt)));
  return card;
}

function renderVendePage(): HTMLElement {
  const page = node('main', 'page-width content-page');
  const hero = node('section', 'seller-hero');
  hero.append(
    node('p', 'eyebrow', 'Hecho para el comercio local'),
    node('h1', 'page-title', 'Tu próximo cliente puede estar cerca'),
    node('p', 'page-subtitle', 'Muestra tus productos a la comunidad de Yacuiba desde Mío CASE.'),
    downloadLink('Descargar para Android', 'button button--primary button--wide')
  );
  if (apkUrl) {
    hero.append(node('p', 'version-label', `Versión ${appVersion || 'por configurar'}`));
  }
  if (!apkUrl) hero.append(node('p', 'muted-copy', 'La descarga de la app estará disponible próximamente.'));
  page.append(hero);

  const steps = node('section', 'seller-section');
  steps.append(node('h2', 'section-title', 'Empieza en tres pasos'));
  const stepGrid = node('div', 'benefit-grid');
  [
    ['01', 'Descarga la app', 'Instala Mío CASE en tu teléfono Android.'],
    ['02', 'Crea tu cuenta de vendedor', 'Completa tu perfil y solicita acceso para vender.'],
    ['03', 'Publica tus productos', 'Agrega fotos, precio y detalles para que te encuentren.'],
  ].forEach(([number, title, copy]) => {
    const card = node('article', 'benefit-card');
    card.append(
      node('span', 'benefit-card__number', number),
      node('h3', 'benefit-card__title', title),
      node('p', 'body-copy', copy)
    );
    stepGrid.append(card);
  });
  steps.append(stepGrid);
  page.append(steps);

  const benefits = node('section', 'seller-section');
  benefits.append(node('h2', 'section-title', 'Vende con confianza'));
  const benefitGrid = node('div', 'benefit-grid');
  [
    ['Gratis', 'Empieza a publicar sin pagar por cada anuncio.'],
    ['Comunidad local', 'Conecta con personas que compran en Yacuiba.'],
    ['Contacto directo', 'Las personas interesadas pueden contactarte por WhatsApp desde la app.'],
  ].forEach(([title, copy]) => {
    const card = node('article', 'benefit-card');
    card.append(node('h3', 'benefit-card__title', title), node('p', 'body-copy', copy));
    benefitGrid.append(card);
  });
  benefits.append(benefitGrid);
  page.append(benefits);

  const install = node('section', 'install-card');
  install.append(
    node('h2', 'section-title', 'Cómo instalar'),
    node('p', 'body-copy', apkUrl ? 'Sigue estos pasos para instalar la app:' : 'Cuando la descarga esté disponible:')
  );
  const list = node('ol', 'install-steps');
  ['Descarga el archivo APK.', 'Ábrelo desde tu teléfono.', 'Permite instalar desde este origen cuando Android lo solicite.']
    .forEach((copy) => list.append(node('li', '', copy)));
  install.append(list);
  if (apkUrl) {
    install.append(node('p', 'version-label', `Versión disponible: ${appVersion || 'por configurar'}`));
  }
  page.append(install);
  return page;
}

const draftNote = 'Borrador: debe ser revisado por un profesional antes de publicarse.';

function renderLegalPage(kind: 'terminos' | 'privacidad'): HTMLElement {
  const isPrivacy = kind === 'privacidad';
  const page = node('main', 'page-width content-page legal-page');
  page.append(
    node('span', 'draft-note', draftNote),
    pageTitle(isPrivacy ? 'Política de privacidad' : 'Términos y condiciones')
  );
  const sections = isPrivacy
    ? [
        ['Datos que recopilamos', 'Mío CASE puede guardar correo, nombre, número de WhatsApp verificado y fotos de productos, además de la información necesaria para operar la cuenta y las publicaciones.'],
        ['Para qué se usan', 'Usamos estos datos para crear y proteger cuentas, mostrar tiendas y productos, moderar contenido y facilitar que compradores y vendedores se pongan en contacto desde la app. La web pública no muestra números de WhatsApp, correos personales ni identificadores internos de autenticación.'],
        ['Compartición y venta de datos', 'No vendemos los datos personales. La información pública de tiendas y productos se muestra para que la comunidad pueda descubrir ofertas locales.'],
        ['Contenido y reportes', 'Las personas usuarias deben publicar contenido legal, veraz y respetuoso. Puedes reportar contenido desde la app para que el equipo de Mío CASE lo revise.'],
        ['Eliminar una cuenta', `Para pedir la eliminación de tu cuenta y los datos asociados, escribe a ${supportEmail ?? 'correo de soporte por configurar'}. Algunas copias pueden conservarse cuando la ley lo exija o para resolver incidentes de seguridad.`],
        ['Pagos y entregas', 'Mío CASE no gestiona pagos ni envíos. Las personas compradoras y vendedoras acuerdan por su cuenta cualquier encuentro o transacción; recomendamos no pagar por adelantado y reunirse en lugares públicos.'],
      ]
    : [
        ['Uso del servicio', 'Mío CASE ayuda a descubrir productos y tiendas de la comunidad de Yacuiba. El acceso a las funciones de vendedor puede requerir revisión y aprobación.'],
        ['Contenido permitido', 'Publica solo productos que tengas derecho a ofrecer. No se permite contenido ilegal, engañoso, discriminatorio, ofensivo ni que infrinja derechos de otras personas.'],
        ['Seguridad y reportes', 'La comunidad puede reportar publicaciones, tiendas o reseñas desde la app. Mío CASE puede revisar o retirar contenido que incumpla estas reglas. No pagues por adelantado y coordina encuentros en lugares públicos.'],
        ['Transacciones', 'Mío CASE no gestiona pagos ni envíos, no retiene dinero y no garantiza la calidad, disponibilidad o entrega de los productos publicados. Compradores y vendedores deben verificar los detalles antes de acordar una operación.'],
        ['Cuenta y privacidad', `El uso de datos personales se describe en la Política de privacidad. Para pedir la eliminación de una cuenta, escribe a ${supportEmail ?? 'correo de soporte por configurar'}.`],
        ['Cambios', 'Estos términos son un borrador y pueden actualizarse antes de la publicación oficial. La versión vigente se mostrará en este sitio.'],
      ];
  const content = node('div', 'legal-content');
  sections.forEach(([title, body]) => {
    const section = node('section', 'legal-section');
    section.append(node('h2', 'legal-section__title', title), node('p', 'body-copy', body));
    content.append(section);
  });
  page.append(content);
  return page;
}

function renderNotFound(): HTMLElement {
  const page = node('main', 'page-width content-page');
  page.append(
    statusPanel('No encontramos esta página', 'Usa el inicio para seguir explorando.'),
    link('Ir al inicio', '#/', 'button button--primary')
  );
  return page;
}

function renderCurrentRoute(): void {
  routeVersion += 1;
  feedRequestVersion += 1;
  homeFeed = null;
  homeCategories = null;
  homeStores = null;
  searchInput = null;
  window.clearTimeout(searchTimer);

  const rawRoute = window.location.hash.replace(/^#/, '').replace(/^\/+/, '');
  const [routePath, rawId] = rawRoute.split('/');
  let page: HTMLElement;
  if (routePath === '') {
    page = renderHome();
    document.title = 'Mío CASE — Bueno, bonito, barato';
  } else if (routePath === 'producto' && rawId) {
    page = renderProductPage(decodeRouteId(rawId));
    document.title = 'Producto — Mío CASE';
  } else if (routePath === 'tienda' && rawId) {
    page = renderStorePage(decodeRouteId(rawId));
    document.title = 'Tienda — Mío CASE';
  } else if (routePath === 'vende') {
    page = renderVendePage();
    document.title = 'Vende con nosotros — Mío CASE';
  } else if (routePath === 'terminos') {
    page = renderLegalPage('terminos');
    document.title = 'Términos — Mío CASE';
  } else if (routePath === 'privacidad') {
    page = renderLegalPage('privacidad');
    document.title = 'Privacidad — Mío CASE';
  } else {
    page = renderNotFound();
    document.title = 'Página no encontrada — Mío CASE';
  }
  app.replaceChildren(createHeader(), page, createFooter());
}

function decodeRouteId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

window.addEventListener('hashchange', renderCurrentRoute);
renderCurrentRoute();
