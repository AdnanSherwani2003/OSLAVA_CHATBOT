# Flutter Handoff: Authentication & Supabase Session Integration

The Oslava Admin AI Chatbot does **NOT** maintain its own user accounts or separate login endpoints. It authenticates callers strictly by validating existing Supabase Auth JWT access tokens.

## Base URLs
- **Production API**: `https://oslava-chatbot.vercel.app`
- **Local Dev / Android Emulator**: `http://10.0.2.2:3000`
- **Local Dev / iOS Simulator**: `http://localhost:3000`

> [!NOTE]
> Never bundle backend secrets (`GROQ_API_KEY`, `DATABASE_URL`, Neon credentials, Supabase `service_role` key, or Vercel secrets) into the Flutter application. Flutter only forwards the active user's Supabase session access token.

## 1. Forwarding the Token

Whenever sending an HTTP request to the chatbot API, retrieve the user's active session token from the existing Supabase Flutter client:

```dart
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:http/http.dart' as http;

String? getActiveAccessToken() {
  final session = Supabase.instance.client.auth.currentSession;
  return session?.accessToken;
}

Future<http.Response> postToChatbot(String path, Map<String, dynamic> body) async {
  final token = getActiveAccessToken();
  if (token == null) {
    throw Exception("No active Supabase session.");
  }

  return await http.post(
    Uri.parse('$chatbotBaseUrl$path'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode(body),
  );
}
```

## 2. Who Has Access?

The backend strictly verifies that the authenticated user:
1. Has role `ADMIN` or `SUPER_ADMIN` in the Oslava database.
2. Has account status `ACTIVE`.

If an unauthorized account (e.g. standard `WORKER` or `LEADER`) tries to call the chatbot, the backend returns:
```json
{
  "error": {
    "code": "ROLE_FORBIDDEN",
    "message": "Only ADMIN or SUPER_ADMIN users can access the Admin AI Chatbot.",
    "retryable": false,
    "request_id": "req_..."
  }
}
```

## 3. Handling Token Expiration

Supabase access tokens naturally expire (typically 1 hour). When expired, the backend returns HTTP 401:
```json
{
  "error": {
    "code": "AUTH_INVALID",
    "message": "Provided authentication token is invalid or expired.",
    "retryable": false,
    "request_id": "req_..."
  }
}
```

### Recommended Retry Interceptor in Flutter:
```dart
if (response.statusCode == 401) {
  final error = jsonDecode(response.body)['error'];
  if (error['code'] == 'AUTH_INVALID') {
    // 1. Refresh Supabase session
    final refreshRes = await Supabase.instance.client.auth.refreshSession();
    final newSession = refreshRes.session;

    if (newSession != null) {
      // 2. Retry original request with fresh token
      return await retryWithNewToken(newSession.accessToken);
    }
  }
}
```

Do **not** redirect to login unless `refreshSession()` fails completely.
