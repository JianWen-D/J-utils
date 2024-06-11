import alias from '@rollup/plugin-alias'
import del from 'rollup-plugin-delete'
import nodeResolve from "@rollup/plugin-node-resolve"
import typescript from "rollup-plugin-typescript2"
import commonjs from "@rollup/plugin-commonjs"
import babel from "@rollup/plugin-babel"
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import * as path from 'path'

// es 打包模式
const esConfig = () => {
  return {
    input: "src/index.ts",
    output: {
      preserveModules: true,
      dir: `es/`,
      format: "es",
    },
    external: [
      "axios",
      "node_modules/**"
    ],
    plugins: [
      alias({
        entries: [
          { find: '@', replacement: path.resolve('src') },
        ]
      }),
      del({ targets: `es/*` }),
      json(),
      nodeResolve(),
      typescript(),
      babel({
        presets: ["@babel/preset-env"],
        extensions: [".js", ".jsx", ".ts", ".tsx", ".scss"],
        exclude: "**/node_modules/**",
        babelHelpers: "inline"
      }),
      commonjs({ sourceMap: false }),
      // terser({  
      //   compress: {  
      //     drop_console: true, // 删除所有的 `console` 语句  
      //   },  
      // }), 
    ]
  }
}

export default esConfig;
