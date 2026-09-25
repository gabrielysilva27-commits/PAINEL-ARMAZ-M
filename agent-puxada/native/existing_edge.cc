#define UNICODE
#include <windows.h>
#include <oleacc.h>
#include <mshtml.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <algorithm>
#include <cwctype>

// Read-only discovery of IE-mode document surfaces. No URL, page content,
// cookie, credential, or window title is returned to JavaScript.
struct Surface { bool promax; bool accessible; bool edgeWindow; };
struct Scan { std::vector<Surface> surfaces; bool edgeWindow; };

static std::wstring ClassName(HWND hwnd) {
  wchar_t name[128] = {};
  GetClassNameW(hwnd, name, 128);
  return name;
}

static bool IsPromax(IHTMLDocument2* document) {
  BSTR raw = nullptr;
  if (FAILED(document->get_URL(&raw)) || !raw) return false;
  std::wstring url(raw, SysStringLen(raw));
  SysFreeString(raw);
  std::transform(url.begin(), url.end(), url.begin(), towlower);
  const std::wstring prefix = L"https://imperio.promaxcloud.com.br";
  return url.compare(0, prefix.size(), prefix) == 0 &&
         (url.size() == prefix.size() || url[prefix.size()] == L'/');
}

static BOOL CALLBACK VisitChild(HWND hwnd, LPARAM state) {
  if (ClassName(hwnd) != L"Internet Explorer_Server") return TRUE;
  Scan* scan = reinterpret_cast<Scan*>(state);
  bool accessible = false, promax = false;
  IHTMLDocument2* document = nullptr;
  const HRESULT hr = AccessibleObjectFromWindow(hwnd, OBJID_NATIVEOM,
      IID_IHTMLDocument2, reinterpret_cast<void**>(&document));
  if (SUCCEEDED(hr) && document) {
    accessible = true;
    promax = IsPromax(document);
    document->Release();
  }
  scan->surfaces.push_back({promax, accessible, scan->edgeWindow});
  return TRUE;
}

static BOOL CALLBACK VisitWindow(HWND hwnd, LPARAM state) {
  if (ClassName(hwnd) != L"Chrome_WidgetWin_1") return TRUE;
  Scan* scan = reinterpret_cast<Scan*>(state);
  const bool prior = scan->edgeWindow;
  scan->edgeWindow = true;
  EnumChildWindows(hwnd, VisitChild, state);
  scan->edgeWindow = prior;
  return TRUE;
}

static void SetInt(napi_env env, napi_value out, const char* key, int value) {
  napi_value number;
  napi_create_int32(env, value, &number);
  napi_set_named_property(env, out, key, number);
}

static napi_value Probe(napi_env env, napi_callback_info info) {
  napi_value out;
  napi_create_object(env, &out);
  const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  if (FAILED(initialized) && initialized != RPC_E_CHANGED_MODE) {
    napi_throw_error(env, nullptr, "Não foi possível iniciar a leitura das janelas do Edge.");
    return nullptr;
  }
  Scan scan = {};
  EnumWindows(VisitWindow, reinterpret_cast<LPARAM>(&scan));
  if (SUCCEEDED(initialized)) CoUninitialize();
  int promax = 0, accessible = 0;
  for (const Surface& surface : scan.surfaces) {
    if (surface.promax) ++promax;
    if (surface.accessible) ++accessible;
  }
  SetInt(env, out, "ieModeSurfaces", static_cast<int>(scan.surfaces.size()));
  SetInt(env, out, "accessibleSurfaces", accessible);
  SetInt(env, out, "promaxSurfaces", promax);
  return out;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value probe;
  napi_create_function(env, "probe", NAPI_AUTO_LENGTH, Probe, nullptr, &probe);
  napi_set_named_property(env, exports, "probe", probe);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
