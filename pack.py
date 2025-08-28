#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pot App 翻译插件打包脚本
将 main.js, info.json 和图标文件打包为 .potext 格式
"""

import os
import json
import zipfile
from pathlib import Path


def create_dist_folder():
    """创建 dist 文件夹"""
    dist_path = Path("dist")
    dist_path.mkdir(exist_ok=True)
    return dist_path


def get_plugin_info():
    """从 info.json 获取插件信息"""
    try:
        with open("info.json", "r", encoding="utf-8") as f:
            info = json.load(f)
        return info["id"], info.get("icon", "icon.svg")
    except Exception as e:
        print(f"读取 info.json 失败: {e}")
        return None, None


def pack_plugin():
    """打包插件文件"""
    # 获取插件信息
    plugin_id, icon_file = get_plugin_info()
    if not plugin_id:
        print("无法获取插件ID，打包失败")
        return False

    # 创建输出目录
    dist_path = create_dist_folder()

    # 需要打包的文件列表
    files_to_pack = ["main.js", "info.json", icon_file]

    # 检查文件是否存在
    missing_files = []
    for file_name in files_to_pack:
        if not os.path.exists(file_name):
            missing_files.append(file_name)

    if missing_files:
        print(f"以下文件不存在: {', '.join(missing_files)}")
        return False

    # 创建 zip 文件
    output_file = dist_path / f"{plugin_id}.potext"

    try:
        with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_name in files_to_pack:
                zipf.write(file_name)
                print(f"已添加: {file_name}")

        print(f"\n✅ 打包成功!")
        print(f"输出文件: {output_file}")
        print(f"文件大小: {output_file.stat().st_size} 字节")
        return True

    except Exception as e:
        print(f"打包失败: {e}")
        return False


def main():
    """主函数"""
    print("🚀 开始打包 Pot App 翻译插件...")
    print("-" * 40)

    if pack_plugin():
        print("\n🎉 打包完成!")
    else:
        print("\n❌ 打包失败!")
        exit(1)


if __name__ == "__main__":
    main()
