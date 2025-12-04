# Supabase OAuth Configuration Checklist

## 1. Supabase Dashboard Settings

### Authentication → URL Configuration

Go to: **Supabase Dashboard** → **Your Project** → **Authentication** → **URL Configuration**

#### Site URL
- Should be: `https://cleargo.netlify.com`

#### Redirect URLs (MUST include both):
```
https://cleargo.netlify.com/auth/callback
https://cleargo.netlify.com/
```

**Important:** These URLs must match EXACTLY (including trailing slashes, protocol, etc.)

## 2. Google OAuth Provider Settings

### In Supabase Dashboard:
1. Go to **Authentication** → **Providers** → **Google**
2. Ensure Google provider is **Enabled**
3. Verify **Client ID** and **Client Secret** are set
4. The authorized redirect URI in Google Console should be:
   ```
   https://[your-supabase-project-ref].supabase.co/auth/v1/callback
   ```
   (This is automatically handled by Supabase)

### In Google Cloud Console:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID
5. Under **Authorized redirect URIs**, ensure you have:
   ```
   https://[your-supabase-project-ref].supabase.co/auth/v1/callback
   ```

## 3. Netlify Environment Variables

Ensure these are set in **Netlify Dashboard** → **Site Settings** → **Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
NEXT_PUBLIC_APP_URL=https://cleargo.netlify.com
```

## 4. Cookie Settings Verification

Supabase sets cookies with these default settings:
- `Secure: true` (requires HTTPS - ✅ Netlify provides this)
- `SameSite: lax`
- `HttpOnly: true`
- `Path: /`

## 5. Testing the Configuration

After making changes:

1. **Clear browser cookies** for `cleargo.netlify.com`
2. Try OAuth login again
3. Check **Netlify Function Logs** for debug output:
   - Look for: `🔍`, `🔵`, `🟢`, `✅`, `🍪` emoji logs
   - These will show what cookies are being set

## 6. Common Issues

### Cookies not being set:
- ✅ Check redirect URLs match exactly
- ✅ Verify HTTPS is enabled (Netlify should handle this)
- ✅ Check browser console for cookie errors
- ✅ Verify environment variables are set correctly

### Domain mismatch:
- The code will log warnings if domain mismatch is detected
- Ensure `NEXT_PUBLIC_APP_URL` matches your Netlify domain exactly

### Code exchange fails:
- Check Supabase dashboard logs
- Verify the OAuth code hasn't expired (codes expire quickly)
- Ensure redirect URL is in Supabase allowed list

## 7. Debug Logs

The callback route now includes extensive logging. Check Netlify Function Logs for:
- `🔍` - Request information
- `🔵` - Cookies being set by Supabase
- `🟢` - Cookies set on response
- `✅` - Session created successfully
- `🍪` - Cookies being copied to redirect
- `📋` - Final cookie headers



