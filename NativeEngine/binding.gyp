{
  "targets": [
    {
      "target_name": "actionflow_dsa",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [
        "src/TopologicalSorter.cpp",
        "src/NodeAddonBindings.cpp"
      ],
      "include_dirs": [
        "include",
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [ "NAPI_VERSION=8" ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": [ "/std:c++17" ]
            }
          }
        }],
        ["OS=='linux' or OS=='mac'", {
          "cflags_cc": [ "-std=c++17", "-O3", "-Wall", "-Wextra" ]
        }]
      ]
    }
  ]
}
