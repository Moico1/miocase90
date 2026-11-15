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
- `app.json` configura orientación vertical, esquema `miocase`, íconos, splash, selector de fotos y rutas tipadas. Android e iOS son generados por Expo; no hay carpetas nativas versionadas.
- `package-lock.json` indica npm. Los scripts del proyecto son `start`, `android`, `ios` y `web`; no hay scripts propios de pruebas ni de lint.

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
| `/` | `app/index.tsx` | Comprueba configuración, sesión y membresía; dirige a autenticación, espera/verificación o inicio. |
| `/sign-in` | `app/sign-in.tsx` | Inicio de sesión por correo y contraseña. |
| `/sign-up` | `app/sign-up.tsx` | Registro, nombre visible y envío de metadatos a Supabase Auth. |
| `/check-email` | `app/check-email.tsx` | Instrucciones de confirmación por correo cuando Supabase no crea una sesión inmediata. |
| `/pending` | `app/pending.tsx` | Estado de membresía; permite canjear un código individual o actualizar el estado. |
| `/(tabs)` | `app/(tabs)/_layout.tsx` | Navegación inferior personalizada: Inicio, Publicar y Perfil. Las pestañas son `index` y `two`. |
| `/(tabs)/` | `app/(tabs)/index.tsx` | Pantalla de catálogo (envuelve `FeedScreen`). |
| `/(tabs)/two` | `app/(tabs)/two.tsx` | Perfil, publicaciones propias y administración (envuelve `ProfileScreen`). |
| `/publish` | `app/publish.tsx` | Protege la ruta y presenta `PublishListingScreen`. |
| `/listing/[id]` | `app/listing/[id].tsx` | Valida el parámetro y muestra `ListingDetailScreen` detrás de la protección de membresía. |
| Not-found y HTML | `app/+not-found.tsx`, `app/+html.tsx` | Fallback de ruta y shell HTML exclusivo de web. |

`app/_layout.tsx` monta los proveedores globales: área segura, tema Paper, estado, React Query y autenticación. El `QueryClient` usa `staleTime` de 30 segundos y un reintento por defecto. El layout raíz también declara las pantallas del Stack.

### Funcionalidad: `src/`

- `src/lib/supabase.ts`: cliente Supabase único y comprobación de configuración.
- `src/theme.ts`: paletas MioCASE clara y oscura.
- `src/features/auth/`: proveedor de sesión, formularios y esquemas, estado de acceso, consulta de membresía y barrera de miembro verificado. `errorMessage.ts` normaliza mensajes.
- `src/features/listings/`: catálogo, consultas, detalle, validación y publicación, preparación de imágenes y eliminación.
- `src/features/profile/`: perfil y validación de datos de perfil.
- `src/features/admin/`: panel, lectura de cola de miembros/reportes y decisiones administrativas.
- `src/features/reports/`: diálogo para presentar un reporte de publicación.

### Interfaz y recursos

- `components/` y `constants/`: componentes auxiliares que aún usa la pantalla de ruta no encontrada y utilidades compartidas.
- `assets/images/` y `assets/fonts/`: ícono, recursos Android, splash, favicon y fuente.
- `supabase/migrations/`: esquema y funciones del backend; deben aplicarse en orden.
- `.vscode/` y `.claude/`: preferencias locales de herramientas/editor.
- `AGENTS.md`: instrucciones para contribuciones y comandos habituales.

## Recorridos principales

### Cuenta y acceso

1. El alta llama a `auth.signUp` con correo normalizado, contraseña y `display_name`.
2. El trigger `handle_new_user` crea `profiles` y una fila `community_memberships` en estado `pending`.
3. La confirmación del correo (si está habilitada en Supabase) y la aprobación de la comunidad son pasos distintos.
4. `/` consulta sesión y membresía. Una cuenta `verified` entra en las pestañas; `pending` o `rejected` queda fuera de las funciones protegidas.
5. Un administrador puede aprobar/rechazar manualmente. Alternativamente, el usuario canjea un código de un solo uso, almacenado en backend como hash SHA-256.

El cliente usa `VerifiedMemberGate` para UX y navegación. Las políticas RLS y las funciones SQL vuelven a verificar permisos; la barrera de interfaz no es una frontera de seguridad.

### Descubrir publicaciones

`FeedScreen` carga categorías, retrasa 350 ms la búsqueda escrita y usa `useInfiniteQuery`. `fetchFeedPage` llama al RPC `search_active_listings`, que busca texto con configuración lingüística española, filtra categoría y pagina con cursor `(created_at, id)`. El tamaño visible es 12; se solicita una fila adicional para determinar si hay otra página. Luego se resuelven miniaturas privadas mediante URL firmadas de una hora.

Seleccionar una tarjeta abre `/listing/[id]`. `fetchListingDetail` lee una publicación activa, categoría, fotos, nombre y contacto visible del vendedor. WhatsApp se abre con un enlace `wa.me`; el número solo se incluye si el perfil permite mostrarlo. Un miembro puede reportar una publicación ajena.

### Publicar y administrar productos

1. El formulario verifica membresía, categoría y datos mediante Zod.
2. Se permiten hasta cinco fotos. Se reducen a un máximo de 1280 px y se comprimen como JPEG de hasta 512 KiB cada una.
3. `publishListing` crea un borrador, registra rutas/posiciones, sube fotos al bucket privado `miocase-listing-photos` y llama al RPC `publish_listing`.
4. El RPC solo activa borradores propios de miembros verificados que tengan por lo menos una foto almacenada. Ante errores, el cliente intenta limpiar objetos y descartar el borrador; si el resultado de publicación no se puede confirmar, informa la incertidumbre en vez de repetir la operación a ciegas.
5. En Perfil, el dueño puede marcar activa como vendida. El borrado es por fases: ocultar, borrar archivos y eliminar el registro; si falla, la publicación permanece oculta para permitir reintentar.

### Perfil y moderación

El perfil edita nombre y WhatsApp mediante `update_my_profile`, consulta sus publicaciones y ofrece cierre de sesión. El backend normaliza y valida WhatsApp en formato internacional. El panel administrativo solo aparece si `is_admin()` lo confirma y permite revisar membresías, generar/copiar invitaciones y resolver reportes. Las decisiones de moderación se ejecutan en funciones SQL y quedan en el registro `moderation_actions`.

## Modelo de datos y controles

Las migraciones definen:

- `profiles`: identidad pública/nombre y rol `user` o `admin`.
- `community_memberships`: estado `pending`, `verified` o `rejected`, junto con datos de verificación.
- `membership_invites`: hash, emisor, vencimiento y canje de invitaciones.
- `profile_contacts`: WhatsApp y elección de visibilidad.
- `categories`: catálogo de categorías.
- `listings`: vendedor, categoría, título, descripción, precio, moneda y estado (`draft`, `active`, `sold`, `removed`).
- `listing_images`: ruta privada y orden de hasta cinco imágenes por publicación.
- `reports`: motivo y estado; una persona solo puede reportar una vez cada publicación.
- `moderation_actions`: auditoría de decisiones administrativas.

RLS está habilitado para las tablas de aplicación. En general, los miembros verificados consultan contenido permitido; propietarios y administradores tienen permisos adicionales; las operaciones sensibles de publicación, estado, perfil y moderación usan RPC con comprobaciones en backend. El bucket de fotos es privado, limita el tamaño a 512 KiB y solo admite JPEG/WebP. Las lecturas de fotos se autorizan según propietario, administrador o visibilidad de la publicación.

## Migraciones de Supabase

Aplicar cronológicamente:

1. `20261114150000_create_marketplace_schema.sql`: tablas iniciales, índices, trigger, funciones de invitación, RLS y bucket privado.
2. `20261114170000_add_draft_listing_status.sql`: añade estado `draft`.
3. `20261114170100_safe_listing_publishing.sql`: permisos y políticas para flujos de borrador, publicación segura, descarte y cambio de estado.
4. `20261114172000_add_searchable_listing_feed.sql`: RPC de búsqueda paginada.
5. `20261114190000_complete_mvp_account_moderation.sql`: edición de perfil, moderación, eliminación y auditoría.

El primer administrador se configura manualmente desde el editor SQL de confianza de Supabase, siguiendo el comentario al final de la primera migración. No se debe incorporar una operación para asignar el rol de administrador al cliente móvil.

## Desarrollo y comprobaciones

```powershell
npm install
npm start
npm run android
npm run ios
npm run web
npx tsc --noEmit
```

No hay suite de pruebas automatizadas ni configuración de ESLint en el manifiesto. En esta revisión, `npx expo lint` intentó instalar ESLint y crear configuración automáticamente; la ejecución reportó errores preexistentes en `app/+not-found.tsx` y `src/features/auth/AuthProvider.tsx`, además de una advertencia en `src/features/reports/ReportDialog.tsx`. Para evitar cambios implícitos en dependencias, la configuración creada por ese comando se retiró. Si se desea incorporar lint, debe hacerse como un cambio explícito de tooling y resolver primero esos hallazgos. Las carpetas `.expo/`, `dist/` y `node_modules/` son artefactos/dependencias locales ignorados por Git, no código fuente. No se versionan `ios/` ni `android/`.

## Limpieza de plantilla

Se quitaron las utilidades de ejemplo sin referencias desde la aplicación:

- `components/EditScreenInfo.tsx`: pantalla de ayuda de la plantilla.
- `components/StyledText.tsx`: componente tipográfico usado solo por ese ejemplo.
- `components/useClientOnlyValue.ts` y `components/useClientOnlyValue.web.ts`: helper multiplataforma sin consumidores.

Se conservaron `components/ExternalLink.tsx` y `components/Themed.tsx` porque el primero tiene modificaciones locales y el segundo forma parte de la pantalla de ruta no encontrada. No se borraron `.expo/`, `dist/` ni `node_modules/`: son carpetas locales ignoradas y `dist/` podría contener una salida que el usuario quiera conservar. La guía no trata como basura las pestañas de Inicio/Perfil ni los archivos de configuración y recursos.
