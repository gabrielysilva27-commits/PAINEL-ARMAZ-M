#define UNICODE
#include <windows.h>
#include <oleacc.h>
#include <mshtml.h>
#include <UIAutomation.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <algorithm>
#include <cwctype>
#include <thread>

// Read-only discovery of IE-mode document surfaces. No URL, page content,
// cookie, credential, or window title is returned to JavaScript.
struct Surface { bool promax; bool accessible; bool edgeWindow; };
struct Scan { std::vector<Surface> surfaces; std::vector<std::wstring> layout; bool edgeWindow; int reportWindows; int homeWindows; int shortcutControls; int uiaElements; int csvControls; int visualizeControls; };

static void ProbeAccessibility(HWND hwnd, Scan* scan, const std::wstring& windowIndex) {
  RECT windowRect = {};
  GetWindowRect(hwnd, &windowRect);
  IUIAutomation* automation = nullptr;
  if (FAILED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) || !automation) return;
  IUIAutomationElement* root = nullptr;
  IUIAutomationCondition* condition = nullptr;
  IUIAutomationElementArray* elements = nullptr;
  if (SUCCEEDED(automation->ElementFromHandle(hwnd, &root)) && root &&
      SUCCEEDED(automation->CreateTrueCondition(&condition)) && condition &&
      SUCCEEDED(root->FindAll(TreeScope_Descendants, condition, &elements)) && elements) {
    int length = 0;
    if (SUCCEEDED(elements->get_Length(&length))) {
      scan->uiaElements += length;
      for (int i = 0; i < length && i < 1000; ++i) {
        IUIAutomationElement* item = nullptr;
        if (FAILED(elements->GetElement(i, &item)) || !item) continue;
        BSTR raw = nullptr;
        if (SUCCEEDED(item->get_CurrentName(&raw)) && raw) {
          std::wstring name(raw, SysStringLen(raw));
          std::transform(name.begin(), name.end(), name.begin(), towlower);
          if (name.find(L"csv") != std::wstring::npos) ++scan->csvControls;
          if (name.find(L"visualizar") != std::wstring::npos) ++scan->visualizeControls;
          if (name.find(L"atalho") != std::wstring::npos) ++scan->shortcutControls;
          SysFreeString(raw);
        }
        CONTROLTYPEID type = 0;
        RECT rect = {};
        if (SUCCEEDED(item->get_CurrentControlType(&type)) &&
            (type == UIA_EditControlTypeId || type == UIA_ComboBoxControlTypeId ||
             type == UIA_CheckBoxControlTypeId || type == UIA_ButtonControlTypeId) &&
            SUCCEEDED(item->get_CurrentBoundingRectangle(&rect)) &&
            rect.right > rect.left && rect.bottom > rect.top &&
            scan->layout.size() < 90) {
          const wchar_t* kind = type == UIA_EditControlTypeId ? L"E" :
              type == UIA_ComboBoxControlTypeId ? L"C" :
              type == UIA_CheckBoxControlTypeId ? L"K" : L"B";
          // Geometry and control type only: never transmit field contents or names.
          scan->layout.push_back(windowIndex + L":" + kind + L":" +
              std::to_wstring(rect.left-windowRect.left) + L":" +
              std::to_wstring(rect.top-windowRect.top) + L":" +
              std::to_wstring(rect.right-rect.left) + L":" +
              std::to_wstring(rect.bottom-rect.top));
        }
        item->Release();
      }
    }
  }
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  automation->Release();
}

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
  wchar_t rawTitle[512] = {};
  GetWindowTextW(hwnd, rawTitle, 512);
  std::wstring title(rawTitle);
  std::transform(title.begin(), title.end(), title.begin(), towlower);
  if (title.find(L"movimenta") != std::wstring::npos &&
      title.find(L"estoque") != std::wstring::npos) {
    ++scan->reportWindows;
    ProbeAccessibility(hwnd, scan, std::to_wstring(scan->reportWindows));
  }
  const size_t before = scan->surfaces.size();
  const bool prior = scan->edgeWindow;
  scan->edgeWindow = true;
  EnumChildWindows(hwnd, VisitChild, state);
  scan->edgeWindow = prior;
  if (scan->surfaces.size() > before &&
      !(title.find(L"movimenta") != std::wstring::npos && title.find(L"estoque") != std::wstring::npos)) {
    ++scan->homeWindows;
    ProbeAccessibility(hwnd, scan, L"H" + std::to_wstring(scan->homeWindows));
  }
  return TRUE;
}

static void SetInt(napi_env env, napi_value out, const char* key, int value) {
  napi_value number;
  napi_create_int32(env, value, &number);
  napi_set_named_property(env, out, key, number);
}

static void SetLayout(napi_env env, napi_value out, const Scan& scan) {
  napi_value array;
  napi_create_array_with_length(env, scan.layout.size(), &array);
  for (size_t i = 0; i < scan.layout.size(); ++i) {
    napi_value value;
    napi_create_string_utf16(env, reinterpret_cast<const char16_t*>(scan.layout[i].c_str()),
        scan.layout[i].size(), &value);
    napi_set_element(env, array, static_cast<uint32_t>(i), value);
  }
  napi_set_named_property(env, out, "layout", array);
}

static napi_value Probe(napi_env env, napi_callback_info info) {
  napi_value out;
  napi_create_object(env, &out);
  Scan scan = {};
  // Node may initialize its main thread in MTA. MSHTML automation requires
  // an STA; use a dedicated thread so COM cannot inherit Node's apartment.
  std::thread worker([&scan]() {
    const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (SUCCEEDED(initialized)) {
      EnumWindows(VisitWindow, reinterpret_cast<LPARAM>(&scan));
      CoUninitialize();
    }
  });
  worker.join();
  int promax = 0, accessible = 0;
  for (const Surface& surface : scan.surfaces) {
    if (surface.promax) ++promax;
    if (surface.accessible) ++accessible;
  }
  SetInt(env, out, "ieModeSurfaces", static_cast<int>(scan.surfaces.size()));
  SetInt(env, out, "accessibleSurfaces", accessible);
  SetInt(env, out, "promaxSurfaces", promax);
  SetInt(env, out, "reportWindows", scan.reportWindows);
  SetInt(env, out, "homeWindows", scan.homeWindows);
  SetInt(env, out, "shortcutControls", scan.shortcutControls);
  SetInt(env, out, "uiaElements", scan.uiaElements);
  SetInt(env, out, "csvControls", scan.csvControls);
  SetInt(env, out, "visualizeControls", scan.visualizeControls);
  SetLayout(env, out, scan);
  return out;
}

struct TargetWindow { HWND hwnd; bool home; };
static BOOL CALLBACK FindTarget(HWND hwnd, LPARAM raw) {
  TargetWindow* target = reinterpret_cast<TargetWindow*>(raw);
  if (!IsWindowVisible(hwnd) || ClassName(hwnd) != L"Chrome_WidgetWin_1") return TRUE;
  wchar_t title[512] = {};
  GetWindowTextW(hwnd, title, 512);
  std::wstring name(title);
  std::transform(name.begin(), name.end(), name.begin(), towlower);
  const bool match = target->home
      ? name.find(L"promaxweb") != std::wstring::npos
      : name.find(L"movimenta") != std::wstring::npos && name.find(L"estoque") != std::wstring::npos;
  if (match) { target->hwnd = hwnd; return FALSE; }
  return TRUE;
}

static bool Key(WORD vk, bool up = false) {
  INPUT input = {};
  input.type = INPUT_KEYBOARD;
  input.ki.wVk = vk;
  input.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
  return SendInput(1, &input, sizeof(input)) == 1;
}
static bool TypeText(const std::wstring& value) {
  for (wchar_t c : value) {
    INPUT events[2] = {};
    events[0].type = events[1].type = INPUT_KEYBOARD;
    events[0].ki.wScan = events[1].ki.wScan = c;
    events[0].ki.dwFlags = KEYEVENTF_UNICODE;
    events[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
    if (SendInput(2, events, sizeof(INPUT)) != 2) return false;
  }
  return true;
}
static bool ClickPoint(int x, int y) {
  if (!SetCursorPos(x, y)) return false;
  INPUT events[2] = {};
  events[0].type = events[1].type = INPUT_MOUSE;
  events[0].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
  events[1].mi.dwFlags = MOUSEEVENTF_LEFTUP;
  return SendInput(2, events, sizeof(INPUT)) == 2;
}
static thread_local double coordinateScale = 1.0;
static bool ClickRelative(const RECT& r, int x, int y) {
  return ClickPoint(r.left + static_cast<int>(x * coordinateScale + 0.5),
      r.top + static_cast<int>(y * coordinateScale + 0.5));
}
static bool ReplaceField(const RECT& r, int x, int y, const std::wstring& value) {
  if (!ClickRelative(r, x, y)) return false;
  Sleep(70);
  if (!Key(VK_CONTROL) || !Key('A') || !Key('A', true) || !Key(VK_CONTROL, true)) return false;
  return TypeText(value);
}
static bool ReadString(napi_env env, napi_value object, const char* key, std::wstring* out) {
  napi_value value;
  size_t length = 0;
  if (napi_get_named_property(env, object, key, &value) != napi_ok ||
      napi_get_value_string_utf16(env, value, nullptr, 0, &length) != napi_ok ||
      length > 40) return false;
  std::vector<char16_t> chars(length + 1);
  if (napi_get_value_string_utf16(env, value, chars.data(), chars.size(), &length) != napi_ok) return false;
  out->assign(reinterpret_cast<const wchar_t*>(chars.data()), length);
  return true;
}

static bool ClickNamedButton(HWND hwnd, const std::wstring& expected, bool downloadBar) {
  IUIAutomation* automation = nullptr;
  IUIAutomationElement* root = nullptr;
  IUIAutomationCondition* condition = nullptr;
  IUIAutomationElementArray* elements = nullptr;
  bool clicked = false;
  if (SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) && automation &&
      SUCCEEDED(automation->ElementFromHandle(hwnd, &root)) && root &&
      SUCCEEDED(automation->CreateTrueCondition(&condition)) && condition &&
      SUCCEEDED(root->FindAll(TreeScope_Descendants, condition, &elements)) && elements) {
    int count = 0;
    elements->get_Length(&count);
    RECT wr = {};
    GetWindowRect(hwnd, &wr);
    for (int i = 0; i < count && !clicked; ++i) {
      IUIAutomationElement* item = nullptr;
      if (FAILED(elements->GetElement(i, &item)) || !item) continue;
      BSTR raw = nullptr;
      CONTROLTYPEID type = 0;
      RECT r = {};
      if (SUCCEEDED(item->get_CurrentName(&raw)) && raw &&
          SUCCEEDED(item->get_CurrentControlType(&type)) && type == UIA_ButtonControlTypeId &&
          SUCCEEDED(item->get_CurrentBoundingRectangle(&r)) && r.right > r.left && r.bottom > r.top) {
        std::wstring name(raw, SysStringLen(raw));
        std::transform(name.begin(), name.end(), name.begin(), towlower);
        if (name.find(expected) != std::wstring::npos &&
            (downloadBar ? r.top-wr.top > 500 : r.top-wr.top < 200))
          clicked = ClickPoint((r.left+r.right)/2, (r.top+r.bottom)/2);
      }
      if (raw) SysFreeString(raw);
      item->Release();
    }
  }
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  if (automation) automation->Release();
  return clicked;
}

static napi_value Act(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::wstring stage, values[6];
  bool valid = argc == 2 && ReadString(env, argv[0], "stage", &stage);
  if (valid && stage == L"filters") {
    const char* names[] = {"dateFrom","dateTo","warehouse","deposit","operationFrom","operationTo"};
    for (int i = 0; i < 6; ++i) valid = ReadString(env, argv[1], names[i], &values[i]) && valid;
  }
  std::wstring result = L"invalid-parameters";
  if (valid) {
    std::thread worker([&]() {
      const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
      if (FAILED(initialized)) { result = L"com-unavailable"; return; }
      SetProcessDPIAware();
      TargetWindow target = { nullptr, stage == L"shortcut" };
      EnumWindows(FindTarget, reinterpret_cast<LPARAM>(&target));
      RECT r = {};
      if (!target.hwnd || !GetWindowRect(target.hwnd, &r)) result = L"window-not-found";
      else if (!((GetSystemMetrics(SM_CXSCREEN) == 1280 && GetSystemMetrics(SM_CYSCREEN) == 720) ||
                 (GetSystemMetrics(SM_CXSCREEN) == 1920 && GetSystemMetrics(SM_CYSCREEN) == 1080)))
        result = L"unsupported-screen-geometry";
      else {
        coordinateScale = GetSystemMetrics(SM_CXSCREEN) / 1280.0;
        const int width = r.right-r.left, height = r.bottom-r.top;
        if (target.home ? (width < 1200*coordinateScale || height < 650*coordinateScale) :
            (width < 790*coordinateScale || width > 820*coordinateScale ||
             height < 595*coordinateScale || height > 630*coordinateScale)) {
          result = L"unsupported-window-geometry";
          CoUninitialize();
          return;
        }
        if (IsIconic(target.hwnd)) ShowWindow(target.hwnd, SW_RESTORE);
        Key(VK_MENU);
        Key(VK_MENU, true);
        SetForegroundWindow(target.hwnd);
        Sleep(300);
        GetWindowRect(target.hwnd, &r);
        if (GetForegroundWindow() != target.hwnd) result = L"window-not-foreground";
        else if (stage == L"shortcut") {
          result = ReplaceField(r, 1155, 220, L"02.05.01") &&
              ClickRelative(r, 1233, 220) ? L"ok" : L"input-failed";
        } else if (stage == L"filters") {
          bool ok = ClickRelative(r, 242, 225);
          ok = Key(VK_HOME) && Key(VK_HOME, true) && Key('D') && Key('D', true) &&
              Key(VK_RETURN) && Key(VK_RETURN, true) && ok;
          Sleep(500);
          ok = ReplaceField(r, 594, 212, values[0]) && ok;
          ok = ReplaceField(r, 669, 212, values[1]) && ok;
          ok = ReplaceField(r, 594, 235, values[2]) && ok;
          ok = ReplaceField(r, 669, 235, values[2]) && ok;
          ok = ReplaceField(r, 594, 258, values[3]) && ok;
          ok = ReplaceField(r, 669, 258, values[3]) && ok;
          ok = ReplaceField(r, 594, 327, values[4]) && ok;
          ok = ReplaceField(r, 669, 327, values[5]) && ok;
          ok = ClickRelative(r, 212, 501) && ok;
          result = ok && ClickRelative(r, 736, 578) ? L"ok" : L"input-failed";
        } else if (stage == L"csv") {
          result = ClickNamedButton(target.hwnd, L"csv", false) ? L"ok" : L"csv-not-found";
        } else if (stage == L"save") {
          result = ClickNamedButton(target.hwnd, L"salvar", true) ? L"ok" : L"save-not-found";
        } else result = L"unknown-stage";
      }
      CoUninitialize();
    });
    worker.join();
  }
  napi_value out;
  napi_create_string_utf16(env, reinterpret_cast<const char16_t*>(result.c_str()), result.size(), &out);
  return out;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value probe;
  napi_create_function(env, "probe", NAPI_AUTO_LENGTH, Probe, nullptr, &probe);
  napi_set_named_property(env, exports, "probe", probe);
  napi_value act;
  napi_create_function(env, "act", NAPI_AUTO_LENGTH, Act, nullptr, &act);
  napi_set_named_property(env, exports, "act", act);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
