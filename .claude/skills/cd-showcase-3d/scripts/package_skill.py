#!/usr/bin/env python3
"""
CD Showcase 3D Skill - Packager
将技能目录打包为 .skill 文件
"""
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path


def get_exclusion_patterns() -> set:
    """获取应排除的文件/目录模式"""
    return {
        "__pycache__",
        ".pyc",
        ".pyo",
        ".git",
        ".svn",
        ".DS_Store",
        "Thumbs.db",
        "node_modules",
        ".venv",
        "venv",
        ".idea",
        ".vscode",
        "*.log",
        ".env",
        ".env.local",
    }


def should_exclude(path: Path, base_path: Path) -> bool:
    """检查路径是否应被排除"""
    rel_path = str(path.relative_to(base_path))

    # 排除隐藏文件和目录
    for part in path.parts:
        if part.startswith(".") and part not in [".", ".."]:
            return True

    # 排除模式匹配
    name = path.name
    exclusions = get_exclusion_patterns()
    for pattern in exclusions:
        if pattern.startswith("*"):
            if name.endswith(pattern[1:]):
                return True
        elif name == pattern:
            return True

    return False


def package_skill(skill_dir: str, output_path: str = None) -> bool:
    """打包技能目录为 .skill 文件"""
    skill_path = Path(skill_dir).resolve()

    if not skill_path.exists():
        print(f"❌ 错误: 技能目录不存在: {skill_path}")
        return False

    # 确定输出路径
    if output_path is None:
        output_path = str(skill_path.parent / f"{skill_path.name}.skill")
    output_file = Path(output_path)

    # 读取 meta
    meta_path = skill_path / "_meta.json"
    if not meta_path.exists():
        print("❌ 错误: 缺少 _meta.json")
        return False

    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        if "id" not in meta or "version" not in meta:
            print("❌ 错误: _meta.json 必须包含 'id' 和 'version'")
            return False

    except Exception as e:
        print(f"❌ 错误: 无法读取 _meta.json: {e}")
        return False

    # 创建临时目录用于打包
    temp_dir = tempfile.mkdtemp()
    try:
        temp_skill_dir = Path(temp_dir) / skill_path.name
        temp_skill_dir.mkdir()

        # 复制文件（排除不应包含的）
        copied_files = []
        for src_path in skill_path.rglob("*"):
            if src_path.is_file() and not should_exclude(src_path, skill_path):
                rel_path = src_path.relative_to(skill_path)
                dest_path = temp_skill_dir / rel_path
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dest_path)
                copied_files.append(str(rel_path))

        # 创建 zip（.skill 本质是 zip）
        if output_file.exists():
            output_file.unlink()

        with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zf:
            for file_path in copied_files:
                full_path = temp_skill_dir / file_path
                arcname = f"{skill_path.name}/{file_path}"
                zf.write(full_path, arcname)

        print(f"✅ 技能已打包: {output_file}")
        print(f"   版本: {meta['version']}")
        print(f"   文件数: {len(copied_files)}")

        return True

    finally:
        # 清理临时目录
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    skill_dir = sys.argv[1] if len(sys.argv) > 1 else "."

    # 获取输出路径（可选第二个参数）
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    success = package_skill(skill_dir, output_path)
    sys.exit(0 if success else 1)
