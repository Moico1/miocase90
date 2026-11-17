# Guía técnica de MioCASE

## Qué es

MioCASE es una aplicación Expo/React Native para publicar y descubrir productos dentro de una comunidad local de Yacuiba. La interfaz está en español; las publicaciones admiten BOB, USD y ARS. La autenticación, los datos, las reglas de acceso y las fotos dependen de Supabase.

El proyecto usa Expo Router con rutas en `app/` (directorio raíz), lógica de producto en `src/features/`, componentes reutilizables en `components/` y cambios de esquema versionados en `supabase/migrations/`.

## Tecnologías y configuración

- Expo SDK 58, React Native 0.88, React 19 y TypeScript estricto.
- Expo Router (`expo-router/entry`) para navegación nativa y web.
- Supabase JS v2: Auth, Postgres/RPC y Storage.
- TanStack Query para caché, reintentos, actualización e infinite query.
- React Native Paper para controles y temas claro/oscuro.
- React Hook Form + Zod para formularios y validación.
- Expo Image Picker, Image Manipulator y File System para seleccionar, procesar y subir fotos.
- Alias `@/*` configurado en `tsconfig.json`: `@/features/...` apunta a `src/features/...` y `@/lib/...` a `src/lib/...`.
- `app.json` configura la app nativa para Android y conserva web, con orientación vertical, esquema `miocase`, íconos, splash, selector de fotos y rutas tipadas. No se configura iOS ni se versionan carpetas nativas.
- `package-lock.json` indica npm. Los scripts del proyecto son `start`, `android`, `web` y `lint`; los perfiles EAS se destinan a Android.

### Variables de entorno

Crear `.env` a partir de `.env.example` y definir:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
```

La URL y la clave `anon`/publishable se entregan al cliente; no son una clave de servicio ni deben sustituirse por una credencial privilegiada. La protección real de datos recae en RLS, permisos SQL y funciones de Supabase. `.env` y los archivos de entorno locales están excluidos por `.gitignore`; `.env.example` está permitido.

`src/lib/supabase.ts` comprueba que las variables existan y no sean los marcadores de ejemplo, configura persistencia de sesión con AsyncStorage e impide usar el cliente sin configuración mediante un error explícito.

## Mapa del repositorio

### Navegación: `app/`

| Ruta | Archivo | Función |
|---|---|---|
| `/` | `app/index.tsx` | Catálogo público; no exige iniciar sesión. |
| `/sign-in` | `app/sign-in.tsx` | Inicio de sesión por correo y contraseña; conserva el retorno a una acción del catálogo. |
| `/sign-up` | `app/sign-up.tsx` | Registro como comprador o solicitud inicial para vender. |
| `/check-email` | `app/check-email.tsx` | Instrucciones de confirmación por correo cuando Supabase no crea una sesión inmediata. |
| `/pending` | `app/pending.tsx` | Estado de membresía; permite canjear un código individual o actualizar el estado. |
| `/(tabs)` | `app/(tabs)/_layout.tsx` | Navegación inferior: Inicio, Publicar y Perfil. El feed y Perfil de visitante son accesibles sin cuenta. |
| `/(tabs)/` | `app/(tabs)/index.tsx` | Pantalla de catálogo (envuelve `FeedScreen`). |
| `/(tabs)/two` | `app/(tabs)/two.tsx` | Perfil, publicaciones propias y administración (envuelve `ProfileScreen`). |
| `/publish` | `app/publish.tsx` | Protege la ruta y presenta `PublishListingScreen`. |
| `/listing/[id]` | `app/listing/[id].tsx` | Valida el parámetro y muestra el detalle público; las acciones personales solicitan cuenta y retoman la acción al volver. |
| `/store/[id]` | `app/store/[id].tsx` | Página pública de una tienda aprobada, con productos, reseñas y seguimiento. |
| `/favorites` | `app/favorites.tsx` | Lista privada de productos guardados por la cuenta activa. |
| Not-found y HTML | `app/+not-found.tsx`, `app/+html.tsx` | Fallback de ruta y shell HTML exclusivo de web. |

`app/_layout.tsx` monta los proveedores globales: área segura, tema Paper, estado, React Query y autenticación. El `QueryClient` usa `staleTime` de 30 segundos y un reintento por defecto. El layout raíz también declara las pantallas del Stack.

### Funcionalidad: `src/`

- `src/lib/supabase.ts`: cliente Supabase único y comprobación de configuración.
- `src/theme.ts`: paletas MioCASE clara y oscura; `components/BrandLogo.tsx` muestra la identidad de marca.
- `src/features/auth/`: proveedor de sesión, formularios y esquemas, estado de acceso, consulta de membresía y barrera de miembro verificado. `errorMessage.ts` normaliza mensajes.
- `src/features/listings/`: catálogo, consultas, detalle, validación y publicación, preparación de imágenes y eliminación.
- `src/features/profile/`: perfil y validación de datos de perfil.
- `src/features/admin/`: panel, lectura de cola de miembros/reportes y decisiones administrativas.
- `src/features/reports/`: diálogo para presentar un reporte de publicación.
- `src/features/stores/`: consultas públicas seguras, edición de tienda, página pública y favoritos.
- `src/features/profile/WhatsAppVerificationManager.tsx`: solicitud, ingreso de código y estado de verificación del número.
- `src/features/listings/ListingComments.tsx`: preguntas, respuestas, reportes y bloqueo de autores.

### Interfaz y recursos

- `components/` y `constants/`: componentes auxiliares que aún usa la pantalla de ruta no encontrada y utilidades compartidas.
- `assets/images/` y `assets/fonts/`: ícono, recursos Android, splash, favicon y fuente.
- `supabase/migrations/`: esquema y funciones del backend; deben aplicarse en orden.
- `.vscode/` y `.claude/`: preferencias locales de herramientas/editor.
- `AGENTS.md`: instrucciones para contribuciones y comandos habituales.

## Recorridos principales

### Cuenta y acceso

1. Cualquiera puede explorar el feed, buscar, filtrar y abrir publicaciones sin iniciar sesión.
2. Favoritos, reportes, calificaciones y contacto piden crear una cuenta o iniciar sesión; al volver, la app reanuda la acción solicitada.
3. El registro como comprador queda activo para comprar. Quien se registra para vender, o un comprador que lo solicita desde Perfil, queda pendiente de aprobación.
4. `seller_status` separa la capacidad de publicar del rol de comprador. Solo vendedores aprobados acceden a Publicar y Mis publicaciones.
5. Un administrador puede aprobar/rechazar manualmente. Las solicitudes también pueden canjear un código de un solo uso, almacenado en backend como hash SHA-256.

El cliente usa `VerifiedMemberGate` para UX y navegación. Las políticas RLS y las funciones SQL vuelven a verificar permisos; la barrera de interfaz no es una frontera de seguridad.

### Descubrir publicaciones

`FeedScreen` carga categorías, retrasa 350 ms la búsqueda escrita y usa `useInfiniteQuery`. `fetchFeedPage` llama al RPC `search_active_listings`, que busca texto con configuración lingüística española, filtra categoría, permite ordenar por fecha o precio y pagina con cursor. El servidor limita cada página a 20 filas; el cliente muestra 12 y solicita una adicional para determinar si hay otra página. Las funciones públicas solo exponen los campos del catálogo y generan URLs firmadas para fotos de publicaciones activas o vendidas de vendedores aprobados.

Seleccionar una tarjeta abre `/listing/[id]`. `fetchListingDetail` lee una publicación pública, categoría, fotos y nombre de tienda; nunca recibe WhatsApp ni correo. `request_whatsapp_contact` devuelve el enlace `wa.me` únicamente a una sesión autenticada y registra el evento con un límite de 30 contactos por usuario y día. `app_settings.require_account_to_contact` se inicializa en `true`; cambiarlo no habilita contacto anónimo, porque el endpoint entrega el enlace solo a sesiones autenticadas. Un comprador puede reportar publicaciones ajenas, guardar favoritos y calificar.

Las tarjetas muestran el nombre/logo de tienda y las etiquetas Nuevo, Oferta y Vendido. El inicio presenta tiendas destacadas, ordenamiento por precio/fecha y el filtro de tiendas seguidas para cuentas activas. La página `/store/[id]` solo entrega información de tiendas visibles con vendedor aprobado; no expone el UUID del perfil dueño. Las reseñas se pueden editar (una por cuenta y tienda), y el promedio se calcula en la base. Los comentarios de productos permiten respuestas del vendedor, bloquean enlaces y limitan a cinco por cuenta por hora. La página `/favorites` presenta los productos guardados. Los enlaces compartidos usan el esquema `miocase`.

### Publicar y administrar productos

1. El formulario verifica que el vendedor esté aprobado, además de categoría y datos mediante Zod.
2. Se permiten hasta cinco fotos. Se reducen a un máximo de 1280 px y se comprimen como JPEG de hasta 512 KiB cada una.
3. `publishListing` crea un borrador, registra rutas/posiciones, sube fotos al bucket privado `miocase-listing-photos` y llama al RPC `publish_listing`.
4. El RPC solo activa borradores propios de miembros verificados que tengan por lo menos una foto almacenada. Ante errores, el cliente intenta limpiar objetos y descartar el borrador; si el resultado de publicación no se puede confirmar, informa la incertidumbre en vez de repetir la operación a ciegas.
5. En Perfil, el dueño puede marcar activa como vendida. El borrado es por fases: ocultar, borrar archivos y eliminar el registro; si falla, la publicación permanece oculta para permitir reintentar.

### Perfil y moderación

El perfil edita su nombre mediante `update_my_profile`, consulta sus publicaciones y ofrece cierre de sesión. Vendedores aprobados solicitan verificar su WhatsApp; administración abre el chat, genera un código de cuatro dígitos y lo envía por WhatsApp externo. El código solo se conserva como hash con salt, vence en 24 horas y permite cinco intentos. El perfil solo puede activar la visibilidad después de verificar el número; la base de datos bloquea cambios directos y números verificados duplicados. Vendedores aprobados también pueden editar la tienda, incluido un logo JPEG comprimido a 512 KiB o menos. El panel administrativo solo aparece si `is_admin()` lo confirma y permite revisar membresías, códigos de WhatsApp, invitaciones y reportes de productos y contenido social. La emisión queda en `moderation_actions`.

## Modelo de datos y controles

Las migraciones definen:

- `profiles`: identidad pública/nombre, rol de cuenta comprador/admin y estado independiente del vendedor (`pending`, `approved`, `rejected` o sin solicitud).
- `community_memberships`: estado `pending`, `verified` o `rejected`, junto con datos de verificación.
- `membership_invites`: hash, emisor, vencimiento y canje de invitaciones.
- `profile_contacts`: WhatsApp, su estado de verificación y elección de visibilidad.
- `whatsapp_verifications`: solicitudes de verificación, hash/salt del código, intentos, estado y vencimiento; sin códigos en texto claro.
- `categories`: catálogo de categorías.
- `listings`: vendedor, categoría, título, descripción, precio, moneda y estado (`draft`, `active`, `sold`, `removed`).
- `listing_images`: ruta privada y orden de hasta cinco imágenes por publicación.
- `reports`: motivo y estado; una persona solo puede reportar una vez cada publicación.
- `stores`, `store_reviews`, `listing_comments`, `follows`, `user_blocks` y `content_reports`: tiendas públicas seguras, reseñas, comentarios/respuestas, seguimiento, bloqueo y reportes sociales.
- `moderation_actions`: auditoría de decisiones administrativas.

RLS está habilitado para las tablas de aplicación. `anon` no tiene permisos directos sobre las tablas sociales ni sobre las verificaciones de WhatsApp; los datos públicos se consultan mediante RPCs `SECURITY DEFINER` con `search_path` vacío, permisos explícitos y límites de página. El cliente no puede escribir `profile_contacts.whatsapp_verified`; la actualización del número ocurre únicamente en `verify_whatsapp_code`. Las operaciones sensibles de tienda, reseña, comentario, seguimiento, reporte, verificación y moderación se comprueban en backend. Los logos usan el bucket público separado `miocase-store-logos`; las funciones de sus políticas verifican las tiendas aprobadas sin conceder a `anon` acceso a tablas. `supabase/tests/anon_access.sql` comprueba privilegios, políticas de escritura en Storage y límites de consultas públicas.

## Migraciones de Supabase

Aplicar cronológicamente:

1. `20261114150000_create_marketplace_schema.sql`: tablas iniciales, índices, trigger, funciones de invitación, RLS y bucket privado.
2. `20261114170000_add_draft_listing_status.sql`: añade estado `draft`.
3. `20261114170100_safe_listing_publishing.sql`: permisos y políticas para flujos de borrador, publicación segura, descarte y cambio de estado.
4. `20261114172000_add_searchable_listing_feed.sql`: RPC de búsqueda paginada.
5. `20261114190000_complete_mvp_account_moderation.sql`: edición de perfil, moderación, eliminación y auditoría.
6. `20261115220000_public_browsing_and_seller_roles.sql`: catálogo público controlado, separación de rol comprador/estado vendedor, favoritos, calificaciones, contacto limitado y precio anterior.
7. `20261116210000_store_profiles_and_social_features.sql`: perfiles de tienda y logos, reseñas, comentarios, seguimiento, bloqueos, favoritos privados y moderación social.
8. `20261116230000_whatsapp_phone_verification.sql`: verificación con códigos de cuatro dígitos, límite de intentos, vigencia de 24 horas y restricción de contacto a números verificados.
9. `20261117102000_grant_previous_price_insert.sql`: permite a vendedores autenticados incluir el precio anterior al crear un borrador de publicación.

Comprobar el acceso anónimo y los límites con `supabase/tests/anon_access.sql` desde SQL Editor después de aplicar las migraciones.

El primer administrador se configura manualmente desde el editor SQL de confianza de Supabase, siguiendo el comentario al final de la primera migración. No se debe incorporar una operación para asignar el rol de administrador al cliente móvil.

## Desarrollo y comprobaciones

```powershell
npm install
npm start
npm run android
npm run web
npx tsc --noEmit
npm run lint
```

No hay suite de pruebas automatizadas. ESLint usa explícitamente `eslint-config-expo` desde `eslint.config.js`; `npm run lint` ejecuta la comprobación. Las carpetas `.expo/`, `dist/` y `node_modules/` son artefactos/dependencias locales ignorados por Git, no código fuente. No se versionan `ios/` ni `android/`.

## Limpieza de plantilla

Se quitaron las utilidades de ejemplo sin referencias desde la aplicación:

- `components/EditScreenInfo.tsx`: pantalla de ayuda de la plantilla.
- `components/StyledText.tsx`: componente tipográfico usado solo por ese ejemplo.
- `components/useClientOnlyValue.ts` y `components/useClientOnlyValue.web.ts`: helper multiplataforma sin consumidores.

Se conservaron `components/ExternalLink.tsx` y `components/Themed.tsx` porque el primero tiene modificaciones locales y el segundo forma parte de la pantalla de ruta no encontrada. No se borraron `.expo/`, `dist/` ni `node_modules/`: son carpetas locales ignoradas y `dist/` podría contener una salida que el usuario quiera conservar. La guía no trata como basura las pestañas de Inicio/Perfil ni los archivos de configuración y recursos.
