#define UNICODE
#include <windows.h>
#include <oleacc.h>
#include <mshtml.h>
#include <UIAutomation.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <algorithm>
#include <cstdlib>
#include <cwctype>
#include <thread>

// Read-only discovery of IE-mode document surfaces. No URL, page content,
// cookie, credential, or window title is returned to JavaScript.
struct Surface { bool promax; bool accessible; bool edgeWindow; };
struct Scan { std::vector<Surface> surfaces; std::vector<std::wstring> layout; std::vector<std::wstring> windows; bool edgeWindow; int reportWindows; int homeWindows; int shortcutControls; int uiaElements; int csvControls; int visualizeControls; };

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

static void InspectEdgeWindow(HWND hwnd, bool* automated, int* tabItems, bool* hasPromaxTab) {
  *automated = false;
  *tabItems = 0;
  *hasPromaxTab = false;
  IUIAutomation* automation = nullptr;
  IUIAutomationElement* root = nullptr;
  IUIAutomationCondition* condition = nullptr;
  IUIAutomationElementArray* elements = nullptr;
  if (FAILED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) || !automation) return;
  if (SUCCEEDED(automation->ElementFromHandle(hwnd, &root)) && root &&
      SUCCEEDED(automation->CreateTrueCondition(&condition)) && condition &&
      SUCCEEDED(root->FindAll(TreeScope_Descendants, condition, &elements)) && elements) {
    int count = 0;
    elements->get_Length(&count);
    for (int i = 0; i < count && i < 2000; ++i) {
      IUIAutomationElement* item = nullptr;
      if (FAILED(elements->GetElement(i, &item)) || !item) continue;
      CONTROLTYPEID type = 0;
      const bool isTab = SUCCEEDED(item->get_CurrentControlType(&type)) && type == UIA_TabItemControlTypeId;
      if (isTab) ++(*tabItems);
      BSTR raw = nullptr;
      if (SUCCEEDED(item->get_CurrentName(&raw)) && raw) {
        std::wstring name(raw, SysStringLen(raw));
        std::transform(name.begin(), name.end(), name.begin(), towlower);
        if (isTab && name.find(L"promaxweb") != std::wstring::npos) *hasPromaxTab = true;
        // Match the browser's automation banner, never arbitrary page content.
        // A ChatGPT tab discussing WebDriver must not exclude a normal Edge window.
        if (type == UIA_TextControlTypeId && name.size() < 180 &&
            (name.find(L"is being controlled by automated test software") != std::wstring::npos ||
             (name.find(L"está sendo controlado") != std::wstring::npos &&
              name.find(L"software de teste") != std::wstring::npos))) {
          *automated = true;
        }
        SysFreeString(raw);
      }
      item->Release();
    }
  }
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  automation->Release();
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
  RECT bounds={};
  if(IsWindowVisible(hwnd)&&GetWindowRect(hwnd,&bounds)&&bounds.right-bounds.left>500&&scan->windows.size()<20){
    const std::wstring kind=title.find(L"ocp carregamento")!=std::wstring::npos?L"OCP":title.find(L"promaxweb")!=std::wstring::npos?L"HOME":title.find(L"movimenta")!=std::wstring::npos?L"STOCK":L"OTHER";
    HWND owner=GetAncestor(hwnd,GA_ROOTOWNER);
    scan->windows.push_back(kind+L":enabled="+std::to_wstring(IsWindowEnabled(hwnd)?1:0)+L":foreground="+std::to_wstring(GetAncestor(GetForegroundWindow(),GA_ROOT)==hwnd?1:0)+L":owner_enabled="+std::to_wstring(IsWindowEnabled(owner)?1:0));
  }
  const size_t before = scan->surfaces.size();
  const bool prior = scan->edgeWindow;
  scan->edgeWindow = true;
  EnumChildWindows(hwnd, VisitChild, state);
  scan->edgeWindow = prior;
  const bool titleLooksPromax = title.find(L"promaxweb") != std::wstring::npos;
  bool automated = false;
  bool hasPromaxTab = false;
  int tabItems = 0;
  InspectEdgeWindow(hwnd, &automated, &tabItems, &hasPromaxTab);
  if ((titleLooksPromax || hasPromaxTab) && !automated &&
      !(title.find(L"movimenta") != std::wstring::npos && title.find(L"estoque") != std::wstring::npos)) {
    ++scan->homeWindows;
    // Only map controls when Promax is the active tab; a background Promax tab
    // is enough for readiness but its window currently exposes another page.
    if (titleLooksPromax)
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
  napi_value windows; napi_create_array_with_length(env,scan.windows.size(),&windows);
  for(size_t i=0;i<scan.windows.size();++i){napi_value v;napi_create_string_utf16(env,reinterpret_cast<const char16_t*>(scan.windows[i].c_str()),scan.windows[i].size(),&v);napi_set_element(env,windows,static_cast<uint32_t>(i),v);}
  napi_set_named_property(env,out,"windows",windows);
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

struct TargetWindow { HWND hwnd; bool home; int score; std::vector<HWND> candidates; };
static BOOL CALLBACK FindTarget(HWND hwnd, LPARAM raw) {
  TargetWindow* target = reinterpret_cast<TargetWindow*>(raw);
  if (!IsWindowVisible(hwnd) || ClassName(hwnd) != L"Chrome_WidgetWin_1") return TRUE;
  wchar_t title[512] = {};
  GetWindowTextW(hwnd, title, 512);
  std::wstring name(title);
  std::transform(name.begin(), name.end(), name.begin(), towlower);
  const bool reportMatch =
      name.find(L"movimenta") != std::wstring::npos && name.find(L"estoque") != std::wstring::npos;
  if (!target->home) {
    if (!reportMatch) return TRUE;
    target->hwnd = hwnd; target->score = 1; return FALSE;
  }

  bool automated = false;
  bool hasPromaxTab = false;
  int tabItems = 0;
  InspectEdgeWindow(hwnd, &automated, &tabItems, &hasPromaxTab);
  const bool match = name.find(L"promaxweb") != std::wstring::npos || hasPromaxTab;
  if (!match || automated) return TRUE;
  target->candidates.push_back(hwnd);

  // A second Edge window can also contain a Promax tab (including an old
  // automation window). Prefer the window the operator is actually using;
  // tab count alone selected the wrong background window on the ADM PC.
  const int score = 100 + tabItems +
      (name.find(L"promaxweb") != std::wstring::npos ? 100 : 0) +
      (GetAncestor(GetForegroundWindow(), GA_ROOT) == hwnd ? 1000 : 0);
  if (!target->hwnd || score > target->score) {
    target->hwnd = hwnd;
    target->score = score;
  }
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
    const SHORT mapped = VkKeyScanW(c);
    if (mapped == -1) return false;
    const bool shift = (HIBYTE(mapped) & 1) != 0;
    if (shift && !Key(VK_SHIFT)) return false;
    const WORD vk = LOBYTE(mapped);
    const bool sent = Key(vk) && Key(vk, true);
    if (shift && !Key(VK_SHIFT, true)) return false;
    if (!sent) return false;
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
static bool HasForeground(HWND hwnd) {
  const HWND foreground = GetForegroundWindow();
  return foreground == hwnd || GetAncestor(foreground, GA_ROOT) == hwnd ||
      IsChild(hwnd, foreground);
}

// Windows normally blocks a background process from stealing focus. The agent
// only reaches this point after the workstation has been idle for 30 seconds,
// so temporarily join the input queues of the foreground/browser threads,
// bring the Promax window to the top, then immediately detach again.
static bool FocusWindow(HWND hwnd) {
  if (!hwnd || !IsWindow(hwnd)) return false;

  // Windows may reject the first SetForegroundWindow call when the Edge window
  // belongs to another input queue. Retry a few times and briefly synthesize
  // ALT on later attempts, which legally unlocks foreground activation for the
  // current interactive session. We still verify the resulting foreground
  // window before sending any report clicks or keystrokes.
  for (int attempt = 0; attempt < 6; ++attempt) {
    if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);

    const DWORD currentThread = GetCurrentThreadId();
    const HWND foreground = GetForegroundWindow();
    const DWORD foregroundThread = foreground
        ? GetWindowThreadProcessId(foreground, nullptr) : 0;
    const DWORD targetThread = GetWindowThreadProcessId(hwnd, nullptr);

    bool attachedForeground = false;
    bool attachedTarget = false;
    if (foregroundThread && foregroundThread != currentThread)
      attachedForeground = AttachThreadInput(currentThread, foregroundThread, TRUE) != FALSE;
    if (targetThread && targetThread != currentThread && targetThread != foregroundThread)
      attachedTarget = AttachThreadInput(currentThread, targetThread, TRUE) != FALSE;

    ShowWindow(hwnd, SW_RESTORE);
    SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    BringWindowToTop(hwnd);

    if (attempt > 0) {
      Key(VK_MENU);
      Key(VK_MENU, true);
      Sleep(60);
    }

    SetForegroundWindow(hwnd);
    BringWindowToTop(hwnd);
    SetActiveWindow(hwnd);
    Sleep(220 + attempt * 80);

    const bool focused = HasForeground(hwnd);

    if (attachedTarget)
      AttachThreadInput(currentThread, targetThread, FALSE);
    if (attachedForeground)
      AttachThreadInput(currentThread, foregroundThread, FALSE);

    if (focused) return true;
    Sleep(140);
  }

  return false;
}
static bool ActivatePromaxTab(HWND hwnd) {
  wchar_t currentTitle[512] = {};
  GetWindowTextW(hwnd, currentTitle, 512);
  std::wstring active(currentTitle);
  std::transform(active.begin(), active.end(), active.begin(), towlower);
  if (active.find(L"promaxweb") != std::wstring::npos) return true;

  IUIAutomation* automation = nullptr;
  IUIAutomationElement* root = nullptr;
  IUIAutomationCondition* condition = nullptr;
  IUIAutomationElementArray* elements = nullptr;
  bool activated = false;
  if (SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) && automation &&
      SUCCEEDED(automation->ElementFromHandle(hwnd, &root)) && root &&
      SUCCEEDED(automation->CreateTrueCondition(&condition)) && condition &&
      SUCCEEDED(root->FindAll(TreeScope_Descendants, condition, &elements)) && elements) {
    int count = 0;
    elements->get_Length(&count);
    for (int i = 0; i < count && !activated; ++i) {
      IUIAutomationElement* item = nullptr;
      if (FAILED(elements->GetElement(i, &item)) || !item) continue;
      CONTROLTYPEID type = 0;
      BSTR raw = nullptr;
      RECT rect = {};
      if (SUCCEEDED(item->get_CurrentControlType(&type)) && type == UIA_TabItemControlTypeId &&
          SUCCEEDED(item->get_CurrentName(&raw)) && raw &&
          SUCCEEDED(item->get_CurrentBoundingRectangle(&rect)) &&
          rect.right > rect.left && rect.bottom > rect.top) {
        std::wstring name(raw, SysStringLen(raw));
        std::transform(name.begin(), name.end(), name.begin(), towlower);
        if (name.find(L"promaxweb") != std::wstring::npos)
          activated = ClickPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
      }
      if (raw) SysFreeString(raw);
      item->Release();
    }
  }
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  if (automation) automation->Release();
  return activated;
}
static bool ReadString(napi_env env, napi_value object, const char* key, std::wstring* out, size_t maxLength = 40) {
  napi_value value;
  size_t length = 0;
  if (napi_get_named_property(env, object, key, &value) != napi_ok ||
      napi_get_value_string_utf16(env, value, nullptr, 0, &length) != napi_ok ||
      length > maxLength) return false;
  std::vector<char16_t> chars(length + 1);
  if (napi_get_value_string_utf16(env, value, chars.data(), chars.size(), &length) != napi_ok) return false;
  out->assign(reinterpret_cast<const wchar_t*>(chars.data()), length);
  return true;
}

static bool ClickNamedButton(HWND hwnd, const std::wstring& expected, bool downloadBar, bool anyPosition = false) {
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
        // In Edge IE mode at 150% zoom the report toolbar is around y=220,
        // below the old 200-pixel cutoff. Keep the search inside the upper
        // report area so another CSV control cannot be clicked by accident.
        if (name.find(expected) != std::wstring::npos &&
            (anyPosition || (downloadBar ? r.top-wr.top > 500 : r.top-wr.top < 400)))
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

struct VisibleControl { CONTROLTYPEID type; std::wstring name; RECT rect; long legacyRole=0; };
static std::vector<VisibleControl> Controls(HWND hwnd) {
  std::vector<VisibleControl> found;
  IUIAutomation* automation = nullptr;
  IUIAutomationElement* root = nullptr;
  IUIAutomationCondition* condition = nullptr;
  IUIAutomationElementArray* elements = nullptr;
  if (SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) && automation &&
      SUCCEEDED(automation->ElementFromHandle(hwnd, &root)) && root &&
      SUCCEEDED(automation->CreateTrueCondition(&condition)) && condition &&
      SUCCEEDED(root->FindAll(TreeScope_Descendants, condition, &elements)) && elements) {
    int count = 0;
    elements->get_Length(&count);
    RECT window = {};
    GetWindowRect(hwnd, &window);
    for (int i = 0; i < count && i < 2000; ++i) {
      IUIAutomationElement* item = nullptr;
      if (FAILED(elements->GetElement(i, &item)) || !item) continue;
      RECT r = {};
      CONTROLTYPEID type = 0;
      BOOL offscreen = TRUE;
      if (SUCCEEDED(item->get_CurrentControlType(&type)) &&
          SUCCEEDED(item->get_CurrentBoundingRectangle(&r)) &&
          SUCCEEDED(item->get_CurrentIsOffscreen(&offscreen)) && !offscreen &&
          r.left >= window.left && r.right <= window.right &&
          r.top >= window.top && r.bottom <= window.bottom &&
          r.right > r.left + 2 && r.bottom > r.top + 2) {
        BSTR raw = nullptr;
        std::wstring name;
        if (SUCCEEDED(item->get_CurrentName(&raw)) && raw) {
          name.assign(raw, SysStringLen(raw));
          std::transform(name.begin(), name.end(), name.begin(), towlower);
        }
        if (raw) SysFreeString(raw);
        VARIANT role;VariantInit(&role);long legacyRole=0;
        if(SUCCEEDED(item->GetCurrentPropertyValue(UIA_LegacyIAccessibleRolePropertyId,&role)) && role.vt==VT_I4)legacyRole=role.lVal;
        VariantClear(&role);found.push_back({type,name,r,legacyRole});
      }
      item->Release();
    }
  }
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  if (automation) automation->Release();
  return found;
}
static bool ClickControl(const VisibleControl& c) {
  return ClickPoint((c.rect.left+c.rect.right)/2, (c.rect.top+c.rect.bottom)/2);
}
static bool FillControl(const VisibleControl& c, const std::wstring& value) {
  if (!ClickControl(c)) return false;
  Sleep(70);
  return Key(VK_CONTROL) && Key('A') && Key('A', true) &&
      Key(VK_CONTROL, true) && TypeText(value);
}
static bool Contains(const std::wstring& text, const wchar_t* fragment) {
  return text.find(fragment) != std::wstring::npos;
}
struct ShortcutControls { RECT field = {}, ok = {}; bool found = false; };
// The Promax shortcut moves with display scaling and browser zoom. Locate the
// edit box and its adjacent OK button through UI Automation instead of pixels.
static ShortcutControls FindShortcutControls(HWND hwnd) {
  ShortcutControls result;
  RECT window = {};
  if (!GetWindowRect(hwnd, &window)) return result;
  const int width = window.right - window.left;
  const int height = window.bottom - window.top;
  IUIAutomation* automation = nullptr;
  IUIAutomationElement* root = nullptr;
  IUIAutomationCondition* condition = nullptr;
  IUIAutomationElementArray* elements = nullptr;
  std::vector<RECT> fields, buttons;
  if (SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) && automation &&
      SUCCEEDED(automation->ElementFromHandle(hwnd, &root)) && root &&
      SUCCEEDED(automation->CreateTrueCondition(&condition)) && condition &&
      SUCCEEDED(root->FindAll(TreeScope_Descendants, condition, &elements)) && elements) {
    int count = 0;
    elements->get_Length(&count);
    for (int i = 0; i < count && i < 2000; ++i) {
      IUIAutomationElement* item = nullptr;
      if (FAILED(elements->GetElement(i, &item)) || !item) continue;
      CONTROLTYPEID type = 0;
      RECT r = {};
      if (SUCCEEDED(item->get_CurrentControlType(&type)) &&
          SUCCEEDED(item->get_CurrentBoundingRectangle(&r)) &&
          r.right > r.left && r.bottom > r.top &&
          r.left > window.left + width * 3 / 4 &&
          r.top > window.top + 100 && r.top < window.top + height / 3 &&
          r.right <= window.right + 8 && r.bottom <= window.bottom) {
        if (type == UIA_EditControlTypeId && r.right-r.left >= 65 &&
            r.right-r.left <= 260 && r.bottom-r.top >= 15 && r.bottom-r.top <= 50)
          fields.push_back(r);
        else if (type == UIA_ButtonControlTypeId && r.right-r.left >= 16 &&
            r.right-r.left <= 65 && r.bottom-r.top >= 15 && r.bottom-r.top <= 50)
          buttons.push_back(r);
      }
      item->Release();
    }
  }
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  if (automation) automation->Release();
  int matches = 0;
  for (const RECT& field : fields) for (const RECT& button : buttons) {
    const int fieldMid = (field.top + field.bottom) / 2;
    const int buttonMid = (button.top + button.bottom) / 2;
    if (button.left >= field.right && button.left - field.right <= 24 &&
        std::abs(buttonMid - fieldMid) <= 8) {
      result.field = field;
      result.ok = button;
      ++matches;
    }
  }
  result.found = matches == 1;
  return result;
}

static bool EnterShortcut(const ShortcutControls& controls, const std::wstring& reportCode) {
  const RECT& field = controls.field;
  const RECT& button = controls.ok;
  return ClickPoint((field.left+field.right)/2, (field.top+field.bottom)/2) &&
      Key(VK_CONTROL) && Key('A') && Key('A', true) && Key(VK_CONTROL, true) &&
      TypeText(reportCode) &&
      ClickPoint((button.left+button.right)/2, (button.top+button.bottom)/2);
}

static bool OpenShortcut(HWND hwnd, const std::wstring& reportCode = L"02.05.01") {
  const ShortcutControls controls = FindShortcutControls(hwnd);
  return controls.found && EnterShortcut(controls, reportCode);
}
static BOOL CALLBACK Find031120Window(HWND hwnd, LPARAM raw) {
  if (!IsWindowVisible(hwnd) || ClassName(hwnd) != L"Chrome_WidgetWin_1") return TRUE;
  wchar_t title[512] = {};
  GetWindowTextW(hwnd, title, 512);
  std::wstring name(title);
  std::transform(name.begin(), name.end(), name.begin(), towlower);
  if (name.find(L"planilha de acompanhamento") != std::wstring::npos ||
      name.find(L"03.11.20") != std::wstring::npos) {
    *reinterpret_cast<HWND*>(raw) = hwnd;
    return FALSE;
  }
  return TRUE;
}

static BOOL CALLBACK FindOCPWindow(HWND hwnd, LPARAM raw) {
  if (!IsWindowVisible(hwnd) || ClassName(hwnd) != L"Chrome_WidgetWin_1") return TRUE;
  wchar_t title[512] = {}; GetWindowTextW(hwnd,title,512);
  std::wstring name(title); std::transform(name.begin(),name.end(),name.begin(),towlower);
  if (name.find(L"ocp carregamento") != std::wstring::npos || name.find(L"03.02.36.01") != std::wstring::npos) {
    HWND* chosen=reinterpret_cast<HWND*>(raw);
    if(!*chosen || HasForeground(hwnd) || (!IsWindowEnabled(*chosen)&&IsWindowEnabled(hwnd))) *chosen=hwnd;
    if(HasForeground(hwnd))return FALSE;
  }
  return TRUE;
}

static bool FillReport(HWND hwnd, const std::wstring* values) {
  auto controls = Controls(hwnd);
  std::vector<VisibleControl> edits;
  std::vector<VisibleControl> combos;
  std::vector<VisibleControl> visualizes;
  const VisibleControl* deliveryAction = nullptr;
  const VisibleControl* deliveryLabel = nullptr;
  RECT window = {};
  if (!GetWindowRect(hwnd, &window)) return false;

  for (const auto& c : controls) {
    if (c.type == UIA_EditControlTypeId) edits.push_back(c);
    if (c.type == UIA_ComboBoxControlTypeId) combos.push_back(c);
    if (c.type == UIA_ButtonControlTypeId && Contains(c.name, L"visualizar"))
      visualizes.push_back(c);
    if (Contains(c.name, L"entrega")) {
      if (c.type == UIA_CheckBoxControlTypeId || c.type == UIA_RadioButtonControlTypeId ||
          c.type == UIA_ButtonControlTypeId)
        deliveryAction = &c;
      else if (!deliveryLabel)
        deliveryLabel = &c;
    }
  }
  if (visualizes.empty()) return false;

  std::sort(edits.begin(), edits.end(), [](const VisibleControl& a, const VisibleControl& b) {
    if (abs(a.rect.top-b.rect.top) > 8) return a.rect.top < b.rect.top;
    return a.rect.left < b.rect.left;
  });

  // The ADM and Puxada PCs expose the same 02.05.01 form structure even when
  // Windows resolution differs. Identify the edit controls by their rows
  // instead of using absolute screen coordinates.
  std::vector<std::vector<VisibleControl>> grouped;
  for (const auto& e : edits) {
    if (grouped.empty() || abs(e.rect.top-grouped.back()[0].rect.top) > 8)
      grouped.push_back({e});
    else
      grouped.back().push_back(e);
  }

  std::vector<std::vector<VisibleControl>> rows;
  for (auto& group : grouped) {
    std::sort(group.begin(), group.end(), [](const VisibleControl& a, const VisibleControl& b) {
      return a.rect.left < b.rect.left;
    });
    if (group.size() == 2 && group[1].rect.left >= group[0].rect.right-3)
      rows.push_back(group);
  }

  // Proven ADM order for 02.05.01:
  // 0 date, 1 warehouse, 2 deposit, 3/4 auxiliary filters, 5 operation.
  if (rows.size() < 6) return false;
  const auto& date = rows[0];
  const auto& warehouse = rows[1];
  const auto& deposit = rows[2];
  const std::vector<VisibleControl>* operation = nullptr;

  // Prefer the row nearest the visible "Operação" label when UI Automation
  // exposes it; otherwise use the same stable row used on the ADM PC.
  int bestOperationDistance = 1000000;
  for (const auto& c : controls) {
    if (!Contains(c.name, L"opera")) continue;
    const int labelY = (c.rect.top+c.rect.bottom)/2;
    for (size_t i = 3; i < rows.size(); ++i) {
      const int rowY = (rows[i][0].rect.top+rows[i][0].rect.bottom)/2;
      const int distance = abs(labelY-rowY);
      if (distance < bestOperationDistance) {
        bestOperationDistance = distance;
        operation = &rows[i];
      }
    }
  }
  if (!operation || bestOperationDistance > 70) operation = &rows[5];
  if ((*operation)[0].rect.top <= deposit[0].rect.top) return false;

  // Select the report-type combo beside the date rows. Ignore Edge's own
  // toolbar/address controls, which are also exposed as combo boxes.
  const VisibleControl* reportType = nullptr;
  int bestComboScore = 1000000;
  const int dateY = (date[0].rect.top+warehouse[0].rect.bottom)/2;
  for (const auto& c : combos) {
    if (c.rect.right > date[0].rect.left + 24) continue;
    if (c.rect.top < window.top + 140 || c.rect.bottom > deposit[0].rect.bottom + 50) continue;
    const int score = abs(((c.rect.top+c.rect.bottom)/2)-dateY) +
        abs(date[0].rect.left-c.rect.right)/4;
    if (score < bestComboScore) {
      bestComboScore = score;
      reportType = &c;
    }
  }
  if (!reportType) return false;

  // Use the lowest visible "Visualizar" button belonging to the report form.
  const VisibleControl* visualize = nullptr;
  for (const auto& c : visualizes) {
    if (c.rect.top <= (*operation)[0].rect.top) continue;
    if (!visualize || c.rect.top > visualize->rect.top ||
        (c.rect.top == visualize->rect.top && c.rect.left > visualize->rect.left))
      visualize = &c;
  }
  if (!visualize) return false;

  if (!ClickControl(*reportType) ||
      !Key(VK_HOME) || !Key(VK_HOME, true) || !Key('D') || !Key('D', true) ||
      !Key(VK_RETURN) || !Key(VK_RETURN, true)) return false;

  Sleep(250);
  if (!FillControl(date[0], values[0]) || !FillControl(date[1], values[1]) ||
      !FillControl(warehouse[0], values[2]) || !FillControl(warehouse[1], values[2]) ||
      !FillControl(deposit[0], values[3]) || !FillControl(deposit[1], values[3]) ||
      !FillControl((*operation)[0], values[4]) || !FillControl((*operation)[1], values[5]))
    return false;

  bool deliverySelected = false;
  if (deliveryAction) {
    deliverySelected = ClickControl(*deliveryAction);
  } else if (deliveryLabel && deliveryLabel->rect.top > (*operation)[0].rect.top &&
      deliveryLabel->rect.top < visualize->rect.top) {
    // HTML labels in IE mode toggle the matching radio/checkbox when clicked.
    deliverySelected = ClickControl(*deliveryLabel);
  }

  if (!deliverySelected) {
    // Some Promax IE-mode builds do not expose the "Entrega" option as a UIA
    // control. Reuse the ADM interaction, but anchor it to controls already
    // identified in the form, so monitor resolution and window position do not
    // matter. Baseline ADM geometry: combo left 206, delivery (212,501),
    // Visualizar center y 578 at 21px edit height.
    const int fieldHeight = std::max<int>(12, static_cast<int>(date[0].rect.bottom-date[0].rect.top));
    const int visualizeY = (visualize->rect.top+visualize->rect.bottom)/2;
    const int deliveryX = reportType->rect.left + (6*fieldHeight)/21;
    const int deliveryY = visualizeY - (77*fieldHeight)/21;
    if (deliveryX <= window.left || deliveryX >= window.right ||
        deliveryY <= (*operation)[0].rect.bottom || deliveryY >= visualize->rect.top ||
        !ClickPoint(deliveryX, deliveryY))
      return false;
  }

  Sleep(250);
  return ClickControl(*visualize);
}

// Verify the displayed values through UI Automation before generating a report.
static std::wstring Read031120Value(const VisibleControl& control) {
  IUIAutomation* automation = nullptr;
  IUIAutomationElement* element = nullptr;
  std::wstring value;
  POINT point = {(control.rect.left+control.rect.right)/2,
                 (control.rect.top+control.rect.bottom)/2};
  if (SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) && automation &&
      SUCCEEDED(automation->ElementFromPoint(point, &element)) && element) {
    const PROPERTYID properties[] = {UIA_ValueValuePropertyId, UIA_LegacyIAccessibleValuePropertyId};
    for (PROPERTYID property : properties) {
      VARIANT current; VariantInit(&current);
      if (SUCCEEDED(element->GetCurrentPropertyValue(property, &current)) &&
          current.vt == VT_BSTR && current.bstrVal && SysStringLen(current.bstrVal)) {
        value.assign(current.bstrVal, SysStringLen(current.bstrVal));
      }
      VariantClear(&current);
      if (!value.empty()) break;
    }
  }
  if (element) element->Release();
  if (automation) automation->Release();
  return value;
}
static bool Fill031120Control(const VisibleControl& control, const std::wstring& value) {
  for (int attempt=0; attempt<2; ++attempt) {
    if (!ClickControl(control)) return false;
    Sleep(120);
    if (!Key(VK_CONTROL) || !Key('A') || !Key('A',true) || !Key(VK_CONTROL,true)) return false;
    for (wchar_t character : value) {
      if (!TypeText(std::wstring(1,character))) return false;
      Sleep(35); // Allow the Promax date mask to handle each character.
    }
    if (!Key(VK_TAB) || !Key(VK_TAB,true)) return false;
    Sleep(180);
    if (Read031120Value(control) == value) return true;
  }
  return false;
}
static bool SelectOCPOption(const VisibleControl& control, bool selected) {
  IUIAutomation* automation=nullptr; IUIAutomationElement* element=nullptr;
  // Point lookup can return the text child inside a checkbox/radio. Resolve
  // the semantic control itself by type and rectangle in the active window.
  IUIAutomationElement* root=nullptr; IUIAutomationCondition* condition=nullptr;
  IUIAutomationElementArray* elements=nullptr;
  bool ok=false;
  if (SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation,nullptr,CLSCTX_INPROC_SERVER,IID_IUIAutomation,reinterpret_cast<void**>(&automation))) && automation &&
      SUCCEEDED(automation->ElementFromHandle(GetForegroundWindow(),&root)) && root) {
    VARIANT type; VariantInit(&type);type.vt=VT_I4;type.lVal=control.type;
    if(SUCCEEDED(automation->CreatePropertyCondition(UIA_ControlTypePropertyId,type,&condition)) && condition &&
       SUCCEEDED(root->FindAll(TreeScope_Descendants,condition,&elements)) && elements){
      int count=0;elements->get_Length(&count);
      for(int i=0;i<count && i<2000;++i){
        IUIAutomationElement* candidate=nullptr;RECT rect={};
        if(SUCCEEDED(elements->GetElement(i,&candidate)) && candidate){
          if(SUCCEEDED(candidate->get_CurrentBoundingRectangle(&rect)) &&
             abs(rect.left-control.rect.left)<=2 && abs(rect.top-control.rect.top)<=2 &&
             abs(rect.right-control.rect.right)<=2 && abs(rect.bottom-control.rect.bottom)<=2){element=candidate;break;}
          candidate->Release();
        }
      }
    }
  }
  if(element) {
    if (control.type!=UIA_RadioButtonControlTypeId && control.legacyRole!=ROLE_SYSTEM_RADIOBUTTON) {
      IUIAutomationTogglePattern* pattern=nullptr;
      if (SUCCEEDED(element->GetCurrentPatternAs(UIA_TogglePatternId,IID_IUIAutomationTogglePattern,reinterpret_cast<void**>(&pattern))) && pattern) {
        ToggleState state; if (SUCCEEDED(pattern->get_CurrentToggleState(&state))) {
          if ((state==ToggleState_On)!=selected) pattern->Toggle();
          Sleep(120); ok=SUCCEEDED(pattern->get_CurrentToggleState(&state)) && (state==ToggleState_On)==selected;
        } pattern->Release();
      }
    } else {
      IUIAutomationSelectionItemPattern* pattern=nullptr;
      if (SUCCEEDED(element->GetCurrentPatternAs(UIA_SelectionItemPatternId,IID_IUIAutomationSelectionItemPattern,reinterpret_cast<void**>(&pattern))) && pattern) {
        if (selected) pattern->Select(); BOOL state=FALSE; Sleep(120);
        ok=SUCCEEDED(pattern->get_CurrentIsSelected(&state)) && !!state==selected; pattern->Release();
      }
    }
  }
  if(!ok && element) {
    auto checked=[&](bool* state){
      VARIANT v;VariantInit(&v);bool readable=false;
      if(SUCCEEDED(element->GetCurrentPropertyValue(UIA_LegacyIAccessibleStatePropertyId,&v)) && v.vt==VT_I4){
        *state=(v.lVal & STATE_SYSTEM_CHECKED)!=0;readable=true;
      }VariantClear(&v);return readable;
    };
    bool state=false;
    if(checked(&state)){
      if(state!=selected){ClickControl(control);Sleep(200);}
      ok=checked(&state)&&state==selected;
    }
  }
  if(elements)elements->Release();if(condition)condition->Release();if(root)root->Release();
  if(element)element->Release(); if(automation)automation->Release(); return ok;
}
static thread_local std::wstring OCP_FILTER_ISSUE;
static bool FillOCP(HWND hwnd,const std::wstring* values) {
  OCP_FILTER_ISSUE=L"window-rectangle";
  RECT window={}; if(!GetWindowRect(hwnd,&window))return false;
  auto controls=Controls(hwnd); std::vector<VisibleControl> edits;
  bool hasCsv=false;const VisibleControl* back=nullptr;
  for(const auto& c:controls){if(c.type==UIA_ButtonControlTypeId&&Contains(c.name,L"csv"))hasCsv=true;if(c.type==UIA_ButtonControlTypeId&&c.name==L"voltar")back=&c;}
  if(!hasCsv&&back){if(!ClickControl(*back)){OCP_FILTER_ISSUE=L"back-button";return false;}Sleep(1400);controls=Controls(hwnd);}
  bool csv=false;
  for(const auto& c:controls) {
    if(c.type==UIA_ButtonControlTypeId && Contains(c.name,L"csv"))csv=true;
    if(c.type==UIA_EditControlTypeId && c.rect.top>window.top+160 &&
       c.rect.left>window.left+(window.right-window.left)/2 &&
       c.rect.right-c.rect.left<200)edits.push_back(c);
  }
  if(!csv){OCP_FILTER_ISSUE=L"csv-button";return false;}
  std::sort(edits.begin(),edits.end(),[](const VisibleControl&a,const VisibleControl&b){
    if(abs(a.rect.top-b.rect.top)>8)return a.rect.top<b.rect.top; return a.rect.left<b.rect.left;
  });
  std::vector<VisibleControl> maps;
  for(size_t i=0;i+1<edits.size();++i){
    if(abs(edits[i].rect.top-edits[i+1].rect.top)<=8){maps={edits[i],edits[i+1]};break;}
  }
  if(maps.size()!=2){OCP_FILTER_ISSUE=L"map-fields:"+std::to_wstring(edits.size());return false;}
  // Select the full source, not a picking-only or pallet-only export. Require
  // readable option state; never invert checkboxes blindly.
  bool complete=false,route=false,all=false;int seenComplete=0,seenRoute=0,seenAll=0;
  auto radio=[](const VisibleControl& c){return c.type==UIA_RadioButtonControlTypeId || c.legacyRole==ROLE_SYSTEM_RADIOBUTTON;};
  auto check=[](const VisibleControl& c){return c.type==UIA_CheckBoxControlTypeId || c.type==UIA_TreeItemControlTypeId || c.legacyRole==ROLE_SYSTEM_CHECKBUTTON;};
  // Older IE pages leave input names blank and expose the label as a sibling.
  // Bind only an exact option label to a matching input immediately to its left.
  auto option=[&](const wchar_t* label,bool isRadio,int* seen){
    for(const auto& c:controls){
      if((isRadio?radio(c):check(c)) && Contains(c.name,label)){++*seen;if(SelectOCPOption(c,true))return true;}
    }
    for(const auto& text:controls){
      if(text.name!=label || text.rect.top<window.top+160)continue;
      const VisibleControl* input=nullptr;int nearest=61;
      for(const auto& c:controls){
        if(!(isRadio?radio(c):check(c)))continue;
        int gap=text.rect.left-c.rect.right;
        if(gap>=-4 && gap<nearest && abs((text.rect.top+text.rect.bottom)-(c.rect.top+c.rect.bottom))<=20){input=&c;nearest=gap;}
      }
      if(input){++*seen;if(SelectOCPOption(*input,true))return true;}
    }
    return false;
  };
  complete=option(L"completa",true,&seenComplete);route=option(L"rota",true,&seenRoute);all=option(L"todos",false,&seenAll);
  if(!complete || !route || !all){
    OCP_FILTER_ISSUE=L"options:complete="+std::to_wstring(complete?1:0)+L":route="+std::to_wstring(route?1:0)+L":all="+std::to_wstring(all?1:0)+L":found="+std::to_wstring(seenComplete)+L","+std::to_wstring(seenRoute)+L","+std::to_wstring(seenAll);
    for(const auto& c:controls){if(Contains(c.name,L"completa")||Contains(c.name,L"rota")||Contains(c.name,L"todos"))OCP_FILTER_ISSUE+=L":label-type="+std::to_wstring(c.type)+L",role="+std::to_wstring(c.legacyRole);}
    return false;
  }
  bool central=false;
  for(const auto& c:controls){
    if(c.type!=UIA_ComboBoxControlTypeId || c.rect.top<window.top+160)continue;
    if(Contains(Read031120Value(c),L"Central")||Contains(Read031120Value(c),L"central")){central=true;break;}
  }
  if(!central){OCP_FILTER_ISSUE=L"warehouse";return false;}
  OCP_FILTER_ISSUE=L"map-value-readback";
  return Fill031120Control(maps[0],values[0]) && Fill031120Control(maps[1],values[1]);
}

static bool Select031120Mapa(const VisibleControl& control) {
  if (!ClickControl(control) || !Key(VK_HOME) || !Key(VK_HOME,true) ||
      !Key('M') || !Key('M',true) || !Key(VK_RETURN) || !Key(VK_RETURN,true)) return false;
  Sleep(180);
  std::wstring selected = Read031120Value(control);
  std::transform(selected.begin(), selected.end(), selected.begin(), towlower);
  return selected == L"mapa";
}
static bool Fill031120ByGeometry(HWND hwnd, const std::wstring* values) {
  RECT r = {};
  if (!GetWindowRect(hwnd, &r)) return false;
  const int w = r.right-r.left, h = r.bottom-r.top;
  if (w < 700 || h < 500) return false;

  auto px = [&](double x){ return r.left + static_cast<int>(w*x + 0.5); };
  auto py = [&](double y){ return r.top + static_cast<int>(h*y + 0.5); };
  auto control = [&](double x, double y) {
    return VisibleControl{UIA_EditControlTypeId, L"", {px(x)-2,py(y)-2,px(x)+2,py(y)+2}};
  };

  // Coordenadas normalizadas da tela 03.11.20 validada pela operação:
  // Classificação=M​​apa; pares Data e Veículo; botão Visualizar.
  if (!Select031120Mapa(control(0.308,0.358)) ||
      !Fill031120Control(control(0.690,0.350),values[0]) ||
      !Fill031120Control(control(0.855,0.350),values[1]) ||
      !Fill031120Control(control(0.690,0.388),values[2]) ||
      !Fill031120Control(control(0.855,0.388),values[3])) return false;
  return ClickPoint(px(0.924), py(0.824));
}

static bool Fill031120(HWND hwnd, const std::wstring* values) {
  auto controls = Controls(hwnd);
  // Annual export leaves the result page open. Return to its filter form
  // before trying to fill any fields; otherwise coordinates target the report.
  bool hasVisualize = false;
  const VisibleControl* back = nullptr;
  for (const auto& control : controls) {
    if (control.type == UIA_ButtonControlTypeId && Contains(control.name,L"visualizar")) hasVisualize = true;
    if (control.type == UIA_ButtonControlTypeId && control.name == L"voltar") back = &control;
  }
  if (!hasVisualize && back) {
    if (!ClickControl(*back)) return false;
    Sleep(1400);
    controls = Controls(hwnd);
  }
  std::vector<VisibleControl> edits, combos, visualizes;
  RECT window = {};
  if (!GetWindowRect(hwnd, &window)) return false;
  for (const auto& c : controls) {
    if (c.type == UIA_EditControlTypeId) edits.push_back(c);
    if (c.type == UIA_ComboBoxControlTypeId) combos.push_back(c);
    if (c.type == UIA_ButtonControlTypeId && Contains(c.name, L"visualizar")) visualizes.push_back(c);
  }
  std::sort(edits.begin(), edits.end(), [](const VisibleControl& a, const VisibleControl& b) {
    if (abs(a.rect.top-b.rect.top) > 8) return a.rect.top < b.rect.top;
    return a.rect.left < b.rect.left;
  });
  std::vector<std::vector<VisibleControl>> rows;
  for (const auto& e : edits) {
    if (e.rect.top < window.top + 160 || e.rect.left < window.left + (window.right-window.left)/2) continue;
    if (rows.empty() || abs(e.rect.top-rows.back()[0].rect.top) > 8) rows.push_back({e});
    else rows.back().push_back(e);
  }
  std::vector<std::vector<VisibleControl>> pairs;
  for (auto& row : rows) {
    std::sort(row.begin(), row.end(), [](const VisibleControl& a, const VisibleControl& b){return a.rect.left < b.rect.left;});
    if (row.size() >= 2) pairs.push_back({row[0],row[1]});
  }
  if (pairs.size() < 2 || visualizes.empty()) return Fill031120ByGeometry(hwnd, values);
  const auto& date = pairs[0];
  const auto& vehicle = pairs[1];

  const VisibleControl* classification = nullptr;
  for (const auto& cb : combos) {
    if (cb.rect.left < window.left + (window.right-window.left)/2 &&
        cb.rect.top > window.top + 160 && cb.rect.top < date[0].rect.top + 80) {
      classification = &cb; break;
    }
  }
  if (!classification) return Fill031120ByGeometry(hwnd, values);

  const VisibleControl* visualize = nullptr;
  for (const auto& b : visualizes)
    if (!visualize || b.rect.top > visualize->rect.top) visualize = &b;
  if (!visualize) return Fill031120ByGeometry(hwnd, values);

  if (!Select031120Mapa(*classification) ||
      !Fill031120Control(date[0], values[0]) || !Fill031120Control(date[1], values[1]) ||
      !Fill031120Control(vehicle[0], values[2]) || !Fill031120Control(vehicle[1], values[3]))
    return false; // Never generate or fall back to unverified filters.
  return ClickControl(*visualize);
}

struct SaveWindows { HWND saveAs = nullptr; HWND download = nullptr; };
static BOOL CALLBACK FindSaveWindow(HWND hwnd, LPARAM raw) {
  if (!IsWindowVisible(hwnd) || ClassName(hwnd) != L"#32770") return TRUE;
  wchar_t title[256] = {};
  GetWindowTextW(hwnd, title, 256);
  std::wstring name(title);
  std::transform(name.begin(), name.end(), name.begin(), towlower);
  SaveWindows* windows = reinterpret_cast<SaveWindows*>(raw);
  if (name.find(L"salvar como") == 0 || name.find(L"save as") == 0)
    windows->saveAs = hwnd;
  else if (name.find(L"download de arquivo") == 0 || name.find(L"file download") == 0)
    windows->download = hwnd;
  return TRUE;
}

// Invoke controls only inside a native Windows dialog. Never search the
// Promax report or Edge page for a generic button named Save.
static std::wstring InvokeDialogSave(HWND hwnd, const std::wstring& target, bool setFilename) {
  IUIAutomation* automation = nullptr;
  IUIAutomationElement* root = nullptr;
  IUIAutomationCondition* condition = nullptr;
  IUIAutomationElementArray* elements = nullptr;
  IUIAutomationElement* filename = nullptr;
  IUIAutomationElement* save = nullptr;
  std::wstring result = L"dialog-controls-missing";
  if (SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) && automation &&
      SUCCEEDED(automation->ElementFromHandle(hwnd, &root)) && root &&
      SUCCEEDED(automation->CreateTrueCondition(&condition)) && condition &&
      SUCCEEDED(root->FindAll(TreeScope_Descendants, condition, &elements)) && elements) {
    int count = 0;
    elements->get_Length(&count);
    for (int i = 0; i < count && i < 1000; ++i) {
      IUIAutomationElement* item = nullptr;
      if (FAILED(elements->GetElement(i, &item)) || !item) continue;
      CONTROLTYPEID type = 0;
      BSTR rawName = nullptr, rawId = nullptr;
      item->get_CurrentControlType(&type);
      item->get_CurrentName(&rawName);
      item->get_CurrentAutomationId(&rawId);
      std::wstring name = rawName ? std::wstring(rawName, SysStringLen(rawName)) : L"";
      std::wstring id = rawId ? std::wstring(rawId, SysStringLen(rawId)) : L"";
      std::transform(name.begin(), name.end(), name.begin(), towlower);
      if (type == UIA_EditControlTypeId && !filename &&
          (id == L"1001" || name.find(L"nome do arquivo") != std::wstring::npos ||
           name.find(L"file name") != std::wstring::npos)) { filename = item; filename->AddRef(); }
      if (type == UIA_ButtonControlTypeId && !save &&
          (name == L"salvar" || name == L"&salvar" || name == L"save" || name == L"&save")) {
        save = item; save->AddRef();
      }
      if (rawName) SysFreeString(rawName);
      if (rawId) SysFreeString(rawId);
      item->Release();
    }
    if (save && (!setFilename || filename)) {
      bool filenameReady = !setFilename;
      if (setFilename) {
        IUIAutomationValuePattern* value = nullptr;
        if (SUCCEEDED(filename->GetCurrentPatternAs(UIA_ValuePatternId,
            IID_IUIAutomationValuePattern, reinterpret_cast<void**>(&value))) && value) {
          BSTR path = SysAllocStringLen(target.c_str(), static_cast<UINT>(target.size()));
          filenameReady = path && SUCCEEDED(value->SetValue(path));
          if (path) SysFreeString(path);
          value->Release();
        }
      }
      if (!filenameReady) result = L"dialog-filename-unavailable";
      else {
        IUIAutomationInvokePattern* invoke = nullptr;
        if (SUCCEEDED(save->GetCurrentPatternAs(UIA_InvokePatternId,
            IID_IUIAutomationInvokePattern, reinterpret_cast<void**>(&invoke))) && invoke) {
          result = SUCCEEDED(invoke->Invoke()) ? L"ok" : L"dialog-save-invoke-failed";
          invoke->Release();
        } else result = L"dialog-save-invoke-unavailable";
      }
    }
  }
  if (filename) filename->Release();
  if (save) save->Release();
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  if (automation) automation->Release();
  return result;
}

// IE mode displays its download confirmation as an Edge notification bar.
// Require the Open, Save and Cancel controls together in the bottom portion
// of the report window, so the report toolbar's Save can never match.
static bool InvokeDownloadBarSave(HWND hwnd) {
  IUIAutomation* automation = nullptr;
  IUIAutomationElement* root = nullptr;
  IUIAutomationCondition* condition = nullptr;
  IUIAutomationElementArray* elements = nullptr;
  IUIAutomationElement* save = nullptr;
  bool open = false, cancel = false, confirmed = false;
  RECT openRect = {}, cancelRect = {};
  RECT wr = {};
  GetWindowRect(hwnd, &wr);
  if (SUCCEEDED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER,
      IID_IUIAutomation, reinterpret_cast<void**>(&automation))) && automation &&
      SUCCEEDED(automation->ElementFromHandle(hwnd, &root)) && root &&
      SUCCEEDED(automation->CreateTrueCondition(&condition)) && condition &&
      SUCCEEDED(root->FindAll(TreeScope_Descendants, condition, &elements)) && elements) {
    int count = 0;
    elements->get_Length(&count);
    for (int i = 0; i < count && i < 2000; ++i) {
      IUIAutomationElement* item = nullptr;
      if (FAILED(elements->GetElement(i, &item)) || !item) continue;
      CONTROLTYPEID type = 0;
      RECT r = {};
      BSTR raw = nullptr;
      item->get_CurrentControlType(&type);
      item->get_CurrentBoundingRectangle(&r);
      item->get_CurrentName(&raw);
      if (type == UIA_ButtonControlTypeId && raw && r.right > r.left && r.bottom > r.top &&
          r.top >= wr.top + (wr.bottom-wr.top)*7/10 && r.bottom <= wr.bottom + 8 &&
          r.left >= wr.left && r.right <= wr.right + 8) {
        std::wstring name(raw, SysStringLen(raw));
        std::transform(name.begin(), name.end(), name.begin(), towlower);
        name.erase(std::remove(name.begin(), name.end(), L'&'), name.end());
        if (name == L"abrir" || name == L"open") { open = true; openRect = r; }
        else if (name == L"cancelar" || name == L"cancel") { cancel = true; cancelRect = r; }
        else if (name == L"salvar" || name == L"save") {
          if (save) save->Release();
          save = item;
          save->AddRef();
        }
      }
      if (raw) SysFreeString(raw);
      item->Release();
    }
    if (open && cancel && save) {
      IUIAutomationInvokePattern* invoke = nullptr;
      if (SUCCEEDED(save->GetCurrentPatternAs(UIA_InvokePatternId,
          IID_IUIAutomationInvokePattern, reinterpret_cast<void**>(&invoke))) && invoke) {
        confirmed = SUCCEEDED(invoke->Invoke());
        invoke->Release();
      }
      if (!confirmed) {
        RECT r = {};
        if (SUCCEEDED(save->get_CurrentBoundingRectangle(&r)))
          confirmed = ClickPoint((r.left+r.right)/2, (r.top+r.bottom)/2);
      }
    }
    // Edge IE mode may expose the middle split Save control without a UIA
    // button role. Its two adjacent buttons bound the exact clickable area.
    if (!confirmed && open && cancel && !save &&
        cancelRect.left > openRect.right + 35 &&
        cancelRect.left < openRect.right + 240 &&
        openRect.top <= cancelRect.bottom && cancelRect.top <= openRect.bottom) {
      const int x = (openRect.right + cancelRect.left) / 2;
      const int y = (openRect.top + openRect.bottom) / 2;
      confirmed = ClickPoint(x, y);
    }
  }
  if (save) save->Release();
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  if (automation) automation->Release();
  return confirmed;
}

static BOOL CALLBACK FindReportForDownload(HWND hwnd, LPARAM raw) {
  if (!IsWindowVisible(hwnd) || ClassName(hwnd) != L"Chrome_WidgetWin_1") return TRUE;
  wchar_t title[512] = {};
  GetWindowTextW(hwnd, title, 512);
  std::wstring name(title);
  std::transform(name.begin(), name.end(), name.begin(), towlower);
  if ((name.find(L"movimenta") != std::wstring::npos && name.find(L"estoque") != std::wstring::npos) ||
      name.find(L"planilha de acompanhamento") != std::wstring::npos ||
      name.find(L"03.11.20") != std::wstring::npos ||
      name.find(L"ocp carregamento") != std::wstring::npos ||
      name.find(L"03.02.36.01") != std::wstring::npos)
    reinterpret_cast<std::vector<HWND>*>(raw)->push_back(hwnd);
  return TRUE;
}

static std::wstring SaveDialog(const std::wstring& target) {
  bool downloadAccepted = false;
  for (int i = 0; i < 40; ++i) {
    SaveWindows windows;
    EnumWindows(FindSaveWindow, reinterpret_cast<LPARAM>(&windows));
    if (windows.saveAs) {
      const std::wstring result = InvokeDialogSave(windows.saveAs, target, true);
      return result == L"ok" ? L"save-as-confirmed" : result;
    }
    std::vector<HWND> reports;
    EnumWindows(FindReportForDownload, reinterpret_cast<LPARAM>(&reports));
    for (HWND report : reports)
      if (InvokeDownloadBarSave(report)) return L"download-bar-confirmed";
    if (windows.download && !downloadAccepted) {
      const std::wstring result = InvokeDialogSave(windows.download, target, false);
      if (result != L"ok") return result;
      downloadAccepted = true;
    }
    Sleep(250);
  }
  return downloadAccepted ? L"download-accepted-no-save-as" : L"save-dialog-not-found";
}

static napi_value Act(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::wstring stage, values[6];
  bool valid = argc == 2 && ReadString(env, argv[0], "stage", &stage);
  std::wstring savePath;
  if (valid && stage == L"save")
    valid = ReadString(env, argv[1], "path", &savePath, 1024) &&
        !savePath.empty() && savePath.find(L"..") == std::wstring::npos;
  if (valid && stage == L"filters") {
    const char* names[] = {"dateFrom","dateTo","warehouse","deposit","operationFrom","operationTo"};
    for (int i = 0; i < 6; ++i) valid = ReadString(env, argv[1], names[i], &values[i]) && valid;
  }
  if (valid && stage == L"filters031120") {
    const char* names[] = {"dateFrom","dateTo","vehicleFrom","vehicleTo"};
    for (int i = 0; i < 4; ++i) valid = ReadString(env, argv[1], names[i], &values[i]) && valid;
  }
  if (valid && stage == L"filters03023601") {
    valid = ReadString(env,argv[1],"mapFrom",&values[0]) && ReadString(env,argv[1],"mapTo",&values[1]);
  }
  std::wstring result = L"invalid-parameters";
  if (valid) {
    std::thread worker([&]() {
      const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
      if (FAILED(initialized)) { result = L"com-unavailable"; return; }
      SetProcessDPIAware();
      const bool ocpStage=stage==L"shortcut03023601"||stage==L"filters03023601"||stage==L"csv03023601";
      if(ocpStage){MSG message={};PeekMessageW(&message,nullptr,0,0,PM_NOREMOVE);}
      if (stage == L"save") {
        result = SaveDialog(savePath);
        CoUninitialize();
        return;
      }
      TargetWindow target = { nullptr, stage == L"shortcut" || stage == L"shortcut031120" || stage == L"shortcut03023601", -1, {} };
      if (stage == L"filters03023601" || stage == L"csv03023601") {
        HWND report=nullptr; EnumWindows(FindOCPWindow,reinterpret_cast<LPARAM>(&report)); target.hwnd=report;
      } else if (stage == L"filters031120" || stage == L"csv031120") {
        HWND report031120 = nullptr;
        EnumWindows(Find031120Window, reinterpret_cast<LPARAM>(&report031120));
        target.hwnd = report031120;
      } else {
        EnumWindows(FindTarget, reinterpret_cast<LPARAM>(&target));
      }
      if(stage==L"shortcut03023601" && target.hwnd && !IsWindowEnabled(target.hwnd)){
        target.hwnd=nullptr;
        for(HWND candidate:target.candidates){if(IsWindow(candidate)&&IsWindowEnabled(candidate)){target.hwnd=candidate;if(HasForeground(candidate))break;}}
      }
      RECT r = {};
      if (!target.hwnd || !GetWindowRect(target.hwnd, &r)) result = L"window-not-found";
      else {
        if (!FocusWindow(target.hwnd)) {
          result=L"window-not-foreground";
          if(ocpStage)result+=L":exists="+std::to_wstring(IsWindow(target.hwnd)?1:0)+L":enabled="+std::to_wstring(IsWindowEnabled(target.hwnd)?1:0)+L":popup="+std::to_wstring(GetLastActivePopup(target.hwnd)!=target.hwnd?1:0);
        }
        else if (stage == L"shortcut" || stage == L"shortcut031120" || stage == L"shortcut03023601") {
          result = L"shortcut-controls-not-found";
          const std::wstring reportCode = stage == L"shortcut03023601" ? L"03.02.36.01" : stage == L"shortcut031120" ? L"03.11.20" : L"02.05.01";
          for (HWND candidate : target.candidates) {
            if (!FocusWindow(candidate) || !ActivatePromaxTab(candidate)) continue;
            Sleep(350);
            if (!FocusWindow(candidate)) continue;
            if (!OpenShortcut(candidate, reportCode)) continue;
            result = L"shortcut-no-report-window";
            for (int i = 0; i < 30; ++i) {
              Sleep(200);
              if (stage == L"shortcut03023601") {
                HWND report=nullptr; EnumWindows(FindOCPWindow,reinterpret_cast<LPARAM>(&report));
                if(report){result=L"ok";break;}
              } else if (stage == L"shortcut031120") {
                HWND report031120 = nullptr;
                EnumWindows(Find031120Window, reinterpret_cast<LPARAM>(&report031120));
                if (report031120) { result = L"ok"; break; }
              } else {
                TargetWindow report = { nullptr, false, -1, {} };
                EnumWindows(FindTarget, reinterpret_cast<LPARAM>(&report));
                if (report.hwnd) { result = L"ok"; break; }
              }
            }
            break;
          }
        } else if (stage == L"filters") {
          result = FillReport(target.hwnd, values) ? L"ok" : L"filter-controls-not-found";
        } else if (stage == L"filters031120") {
          result = Fill031120(target.hwnd, values) ? L"ok" : L"031120-filter-controls-not-found";
        } else if (stage == L"filters03023601") {
          result=FillOCP(target.hwnd,values)?L"ok":L"03023601-filter-controls-not-found:"+OCP_FILTER_ISSUE;
        } else if (stage == L"csv" || stage == L"csv031120" || stage == L"csv03023601") {
          result = ClickNamedButton(target.hwnd, L"csv", false, true) ? L"ok" : L"csv-not-found";
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

static napi_value IdleMilliseconds(napi_env env, napi_callback_info info) {
  LASTINPUTINFO last = { sizeof(LASTINPUTINFO), 0 };
  napi_value value;
  if (!GetLastInputInfo(&last)) {
    napi_get_null(env, &value);
  } else {
    const DWORD elapsed = GetTickCount() - last.dwTime;
    napi_create_double(env, static_cast<double>(elapsed), &value);
  }
  return value;
}

static napi_value DesktopUnlocked(napi_env env, napi_callback_info info) {
  HDESK desktop = OpenInputDesktop(0, FALSE, DESKTOP_READOBJECTS);
  bool unlocked = false;
  if (desktop) {
    wchar_t name[128] = {};
    DWORD required = 0;
    unlocked = GetUserObjectInformationW(desktop, UOI_NAME, name, sizeof(name), &required) &&
        _wcsicmp(name, L"Default") == 0;
    CloseDesktop(desktop);
  }
  napi_value value;
  napi_get_boolean(env, unlocked, &value);
  return value;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value probe;
  napi_create_function(env, "probe", NAPI_AUTO_LENGTH, Probe, nullptr, &probe);
  napi_set_named_property(env, exports, "probe", probe);
  napi_value act;
  napi_create_function(env, "act", NAPI_AUTO_LENGTH, Act, nullptr, &act);
  napi_set_named_property(env, exports, "act", act);
  napi_value idle;
  napi_create_function(env, "idleMilliseconds", NAPI_AUTO_LENGTH, IdleMilliseconds, nullptr, &idle);
  napi_set_named_property(env, exports, "idleMilliseconds", idle);
  napi_value unlocked;
  napi_create_function(env, "desktopUnlocked", NAPI_AUTO_LENGTH, DesktopUnlocked, nullptr, &unlocked);
  napi_set_named_property(env, exports, "desktopUnlocked", unlocked);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
