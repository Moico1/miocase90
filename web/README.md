# Mío CASE — web pública

Sitio estático en Vite + TypeScript. La web consume únicamente funciones RPC públicas de Supabase y no inicia sesión ni realiza escrituras.

## Variables de entorno

Copia `.env.example` como `.env.local` y configura:

| Variable | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Clave pública `anon`/publishable. Nunca uses una clave `service_role` o secreta. |
| `VITE_APK_URL` | URL HTTPS de descarga directa del APK. Si no está definida, el sitio muestra “Próximamente”. |
| `VITE_APP_VERSION` | Versión visible de la descarga Android. |
| `VITE_SUPPORT_EMAIL` | Correo que se muestra como contacto de soporte y en los borradores legales. |

Las variables `VITE_*` se incluyen en el código público del navegador. Solo deben contener información destinada a clientes. No incluyas secretos.

## Desarrollo y compilación

```powershell
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` genera el sitio estático en `web/dist`. Para probar el catálogo, configura primero las variables de Supabase en `.env.local`.

## Publicar en Vercel

1. Importa el repositorio en Vercel.
2. Establece **Root Directory** en `web`.
3. Usa `npm run build` como comando de compilación y `dist` como directorio de salida.
4. Agrega las variables de entorno necesarias para los entornos que vayas a publicar y despliega.

El archivo `vercel.json` está incluido. Las rutas de contenido usan hash (`#/producto/ID`, `#/tienda/ID`, etc.), por lo que no requieren reglas de reescritura.

## Publicar en Netlify

1. Importa el repositorio en Netlify.
2. Establece `web` como **Base directory**.
3. Usa `npm run build` como comando de compilación y `dist` como directorio de publicación.
4. Configura las mismas variables de entorno y despliega.

La configuración base está en `netlify.toml`. Las rutas con hash funcionan en hosting estático sin reglas adicionales.
