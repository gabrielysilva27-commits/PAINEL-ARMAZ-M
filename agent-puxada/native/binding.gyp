{
  "targets": [{
    "target_name": "existing_edge",
    "sources": ["existing_edge.cc"],
    "libraries": ["oleacc.lib", "oleaut32.lib", "ole32.lib", "UIAutomationCore.lib"],
    "msvs_settings": {"VCCLCompilerTool": {"AdditionalOptions": ["/std:c++17"]}}
  }]
}
