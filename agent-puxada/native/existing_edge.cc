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
        if (name.find(L"automated test") != std::wstring::npos ||
            (name.find(L"controlado") != std::wstring::npos && name.find(L"teste") != std::wstring::npos) ||
            name.find(L"webdriver") != std::wstring::npos) {
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
        if (name == L"abrir" || name == L"open") open = true;
        else if (name == L"cancelar" || name == L"cancel") cancel = true;
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
  }
  if (save) save->Release();
  if (elements) elements->Release();
  if (condition) condition->Release();
  if (root) root->Release();
  if (automation) automation->Release();
  return confirmed;
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
    TargetWindow report = { nullptr, false, -1, {} };
    EnumWindows(FindTarget, reinterpret_cast<LPARAM>(&report));
    if (report.hwnd && InvokeDownloadBarSave(report.hwnd)) return L"download-bar-confirmed";
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
  std::wstring result = L"invalid-parameters";
  if (valid) {
    std::thread worker([&]() {
      const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
      if (FAILED(initialized)) { result = L"com-unavailable"; return; }
      SetProcessDPIAware();
      if (stage == L"save") {
        result = SaveDialog(savePath);
        CoUninitialize();
        return;
      }
      TargetWindow target = { nullptr, stage == L"shortcut", -1, {} };
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
        if (!HasForeground(target.hwnd))
          result = L"window-not-foreground-" + stage + L"-target-" + ClassName(target.hwnd) +
              L"-foreground-" + ClassName(GetForegroundWindow());
        else if (stage == L"shortcut") {
          if (!ActivatePromaxTab(target.hwnd)) {
            result = L"promax-tab-not-found";
            CoUninitialize();
            return;
          }
          Sleep(900);
          GetWindowRect(target.hwnd, &r);
          COLORREF panel = CLR_INVALID, input = CLR_INVALID, area = CLR_INVALID;
          auto sampleHome = [&]() {
            HDC screen = GetDC(nullptr);
            // Maximized Edge extends its window rect beyond the visible top
            // border. Probe inside the blue Atalho band, not its top edge.
            bool blueBand = false;
            for (int y = 202; screen && y <= 210 && !blueBand; y += 4) {
              panel = GetPixel(screen, r.left + static_cast<int>(1150*coordinateScale),
                  r.top + static_cast<int>(y*coordinateScale));
              blueBand = panel != CLR_INVALID && GetRValue(panel) <= 110 &&
                  GetGValue(panel) <= 110 && GetBValue(panel) >= 35;
            }
            input = screen ? GetPixel(screen,
                r.left + static_cast<int>(1150*coordinateScale),
                r.top + static_cast<int>(220*coordinateScale)) : CLR_INVALID;
            area = screen ? GetPixel(screen,
                r.left + static_cast<int>(1000*coordinateScale),
                r.top + static_cast<int>(350*coordinateScale)) : CLR_INVALID;
            if (screen) ReleaseDC(nullptr, screen);
            return blueBand;
          };
          bool homeVisible = sampleHome();
          // Several Edge windows may have a Promax tab. Only interact with a
          // window whose visible page matches the actual shortcut panel.
          for (HWND candidate : target.candidates) {
            if (homeVisible || candidate == target.hwnd) continue;
            RECT other = {};
            if (IsIconic(candidate)) ShowWindow(candidate, SW_RESTORE);
            if (!GetWindowRect(candidate, &other) ||
                other.right-other.left < 1200*coordinateScale ||
                other.bottom-other.top < 650*coordinateScale) continue;
            SetForegroundWindow(candidate);
            Sleep(300);
            if (GetAncestor(GetForegroundWindow(), GA_ROOT) != candidate) continue;
            if (!ActivatePromaxTab(candidate)) continue;
            Sleep(900);
            GetWindowRect(candidate, &r);
            homeVisible = sampleHome();
            if (homeVisible) target.hwnd = candidate;
          }
          if (!homeVisible) {
            result = L"home-panel-rgb-" + std::to_wstring(GetRValue(panel)) + L"-" +
                std::to_wstring(GetGValue(panel)) + L"-" + std::to_wstring(GetBValue(panel)) +
                L"-input-" + std::to_wstring(GetRValue(input)) + L"-" +
                std::to_wstring(GetGValue(input)) + L"-" + std::to_wstring(GetBValue(input)) +
                L"-area-" + std::to_wstring(GetRValue(area)) + L"-" +
                std::to_wstring(GetGValue(area)) + L"-" + std::to_wstring(GetBValue(area)) +
                L"-rect-" + std::to_wstring(r.left) + L"-" + std::to_wstring(r.top) +
                L"-" + std::to_wstring(r.right-r.left) + L"-" + std::to_wstring(r.bottom-r.top) +
                L"-candidates-" + std::to_wstring(target.candidates.size());
            CoUninitialize();
            return;
          }
          if (!ReplaceField(r, 1155, 220, L"02.05.01") ||
              !Key(VK_TAB) || !Key(VK_TAB, true) ||
              !ClickRelative(r, 1233, 220)) result = L"input-failed";
          else {
            result = L"shortcut-no-report-window";
            for (int i = 0; i < 20; ++i) {
              Sleep(200);
              wchar_t title[512] = {};
              GetWindowTextW(GetForegroundWindow(), title, 512);
              std::wstring active(title);
              std::transform(active.begin(), active.end(), active.begin(), towlower);
              if (active.find(L"movimenta") != std::wstring::npos &&
                  active.find(L"estoque") != std::wstring::npos) { result = L"ok"; break; }
            }
          }
        } else if (stage == L"filters") {
          HDC screen = GetDC(nullptr);
          const COLORREF background = screen ? GetPixel(screen,
              r.left + static_cast<int>(400*coordinateScale),
              r.top + static_cast<int>(300*coordinateScale)) : CLR_INVALID;
          if (screen) ReleaseDC(nullptr, screen);
          if (background == CLR_INVALID || GetRValue(background) < 170 ||
              GetRValue(background) > 235 || GetGValue(background) < 170 ||
              GetGValue(background) > 235) {
            result = L"filters-not-on-form";
            CoUninitialize();
            return;
          }
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
