// 03.05.19: named controls plus readback, never unverified screen coordinates.
static BOOL CALLBACK FindABCSalesWindow(HWND hwnd, LPARAM raw) {
  if (!IsWindowVisible(hwnd) || ClassName(hwnd)!=L"Chrome_WidgetWin_1") return TRUE;
  wchar_t title[512]={};GetWindowTextW(hwnd,title,512);std::wstring name(title);
  std::transform(name.begin(),name.end(),name.begin(),towlower);
  if ((name.find(L"resumo f")!=std::wstring::npos && name.find(L"das sa")!=std::wstring::npos) || name.find(L"03.05.19")!=std::wstring::npos) {
    HWND* chosen=reinterpret_cast<HWND*>(raw);
    if(!*chosen||HasForeground(hwnd)||(!IsWindowEnabled(*chosen)&&IsWindowEnabled(hwnd)))*chosen=hwnd;
    if(HasForeground(hwnd))return FALSE;
  }
  return TRUE;
}
static thread_local std::wstring ABC_SALES_ISSUE;
static bool ABCOption(HWND hwnd,const std::vector<VisibleControl>& controls,const std::wstring& label,bool radio,bool selected) {
  const VisibleControl* input=nullptr;
  auto isInput=[&](const VisibleControl& c){return radio?(c.type==UIA_RadioButtonControlTypeId||c.legacyRole==ROLE_SYSTEM_RADIOBUTTON):(c.type==UIA_CheckBoxControlTypeId||c.legacyRole==ROLE_SYSTEM_CHECKBUTTON);};
  for(const auto& c:controls)if(isInput(c)&&Contains(c.name,label.c_str())){input=&c;break;}
  if(!input)for(const auto& text:controls){
    if(!Contains(text.name,label.c_str())||text.rect.bottom-text.rect.top>45)continue;
    int nearest=61;
    for(const auto& c:controls){int gap=text.rect.left-c.rect.right;
      if(isInput(c)&&gap>=-4&&gap<nearest&&abs((text.rect.top+text.rect.bottom)-(c.rect.top+c.rect.bottom))<=20){input=&c;nearest=gap;}
    }
    if(input)break;
  }
  if(input&&SelectOCPOption(*input,selected))return true;
  // IE can expose only labels: verify the known radio visually, without toggling.
  if(radio){const OCPVisual view(hwnd);for(const auto& c:controls)if(Contains(c.name,label.c_str())&&c.rect.bottom-c.rect.top<45&&view.radio(c,selected))return true;}
  return false;
}
static bool FillABCSales(HWND hwnd,const std::wstring* values){
  ABC_SALES_ISSUE=L"window";RECT window={};if(!GetWindowRect(hwnd,&window))return false;
  auto controls=Controls(hwnd);bool hasCsv=false;const VisibleControl* back=nullptr;
  for(const auto& c:controls){if(c.type==UIA_ButtonControlTypeId&&Contains(c.name,L"csv"))hasCsv=true;if(c.type==UIA_ButtonControlTypeId&&c.name==L"voltar")back=&c;}
  if(!hasCsv&&back){if(!ClickControl(*back))return false;Sleep(1200);controls=Controls(hwnd);}
  const VisibleControl* quebra=nullptr;const VisibleControl* dateLabel=nullptr;
  for(const auto& c:controls){if(c.rect.top<window.top+160)continue;
    if(c.name==L"data"&&c.rect.left>window.left+(window.right-window.left)/2)dateLabel=&c;
    if(c.type==UIA_ComboBoxControlTypeId&&c.rect.left<window.left+(window.right-window.left)/2){if(!quebra||c.rect.left<quebra->rect.left)quebra=&c;}
  }
  ABC_SALES_ISSUE=L"quebra1";if(!quebra)return false;
  // Traverse only this dropdown; stop only after exact value verification.
  if(!ClickControl(*quebra)||!Key(VK_HOME)||!Key(VK_HOME,true)||!Key(VK_RETURN)||!Key(VK_RETURN,true))return false;
  bool geral=false;for(int i=0;i<45;i++){Sleep(80);if(Read031120Value(*quebra)==L"Geral"||Read031120Value(*quebra)==L"GERAL"||Read031120Value(*quebra)==L"geral"){geral=true;break;}if(!ClickControl(*quebra)||!Key(VK_DOWN)||!Key(VK_DOWN,true)||!Key(VK_RETURN)||!Key(VK_RETURN,true))return false;}
  if(!geral)return false;
  // Quebra changes can rebuild the document. Reacquire every field.
  controls=Controls(hwnd);dateLabel=nullptr;
  for(const auto& c:controls)if(c.name==L"data"&&c.rect.top>window.top+160&&c.rect.left>window.left+(window.right-window.left)/2)dateLabel=&c;
  ABC_SALES_ISSUE=L"date-label";if(!dateLabel)return false;
  std::vector<VisibleControl> dates;
  for(const auto& c:controls)if(c.type==UIA_EditControlTypeId&&c.rect.left>=dateLabel->rect.right-4&&abs((c.rect.top+c.rect.bottom)-(dateLabel->rect.top+dateLabel->rect.bottom))<=24)dates.push_back(c);
  std::sort(dates.begin(),dates.end(),[](const VisibleControl&a,const VisibleControl&b){return a.rect.left<b.rect.left;});
  ABC_SALES_ISSUE=L"date-fields:"+std::to_wstring(dates.size());if(dates.size()!=2)return false;
  if(!Fill031120Control(dates[0],values[0])||!Fill031120Control(dates[1],values[1]))return false;
  // All brand/type/packaging ranges remain general, including reused forms.
  std::vector<VisibleControl> ranges;
  for(const auto& c:controls)if(c.type==UIA_EditControlTypeId&&c.rect.left>=dateLabel->rect.right-4&&c.rect.top>dates[0].rect.bottom&&c.rect.bottom<=dates[0].rect.bottom+140)ranges.push_back(c);
  std::sort(ranges.begin(),ranges.end(),[](const VisibleControl&a,const VisibleControl&b){if(abs(a.rect.top-b.rect.top)>8)return a.rect.top<b.rect.top;return a.rect.left<b.rect.left;});
  ABC_SALES_ISSUE=L"general-ranges:"+std::to_wstring(ranges.size());if(ranges.size()!=6)return false;
  for(size_t i=0;i<ranges.size();++i)if(!Fill031120Control(ranges[i],i%2?L"999":L"0"))return false;
  const wchar_t* options[]={L"emitida",L"s/ devol nf",L"todas",L"não",L"gerencial"};
  for(const auto* option:options){ABC_SALES_ISSUE=L"option:"+std::wstring(option);if(!ABCOption(hwnd,controls,option,true,true))return false;}
  for(const auto& c:controls)if(c.type==UIA_CheckBoxControlTypeId||c.legacyRole==ROLE_SYSTEM_CHECKBUTTON){ABC_SALES_ISSUE=L"unchecked-preference";if(!SelectOCPOption(c,false))return false;}
  // Date readback immediately before export; successful generation is separate.
  ABC_SALES_ISSUE=L"date-readback";
  return Read031120Value(dates[0])==values[0]&&Read031120Value(dates[1])==values[1];
}
