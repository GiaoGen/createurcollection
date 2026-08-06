#!/usr/bin/env python3
"""
CD Showcase 3D Skill - Quick Validator
验证技能结构和 frontmatter 规范
"""
import json
import re
import sys
from pathlib import Path


def validate_skill(skill_dir: str) -> bool:
    """验证技能目录结构和内容"""
    skill_path = Path(skill_dir)
    errors = []
    warnings = []

    # 1. 检查必填文件
    required_files = ["SKILL.md", "_meta.json"]
    for f in required_files:
        if not (skill_path / f).exists():
            errors.append(f"缺少必填文件: {f}")

    if errors:
        print("❌ 验证失败:")
        for e in errors:
            print(f"   - {e}")
        return False

    # 2. 验证 _meta.json
    try:
        with open(skill_path / "_meta.json", "r", encoding="utf-8") as f:
            meta = json.load(f)

        if "id" not in meta:
            errors.append("_meta.json 缺少 'id' 字段")
        if "version" not in meta:
            errors.append("_meta.json 缺少 'version' 字段")

        # 验证 id 是整数
        if "id" in meta and not isinstance(meta["id"], int):
            errors.append(f"_meta.json 的 'id' 必须是整数，当前: {type(meta['id']).__name__}")

        # 验证 version 格式
        if "version" in meta:
            if not re.match(r"^\d+\.\d+\.\d+$", meta["version"]):
                errors.append(f"version 格式错误，应为 x.y.z，当前: {meta['version']}")

    except json.JSONDecodeError as e:
        errors.append(f"_meta.json JSON 解析错误: {e}")
    except Exception as e:
        errors.append(f"读取 _meta.json 失败: {e}")

    # 3. 验证 SKILL.md frontmatter
    try:
        with open(skill_path / "SKILL.md", "r", encoding="utf-8") as f:
            content = f.read()

        # 检查是否以 frontmatter 开头
        if not content.startswith("---"):
            errors.append("SKILL.md 必须以 YAML frontmatter (---) 开头")

        # 提取 frontmatter
        fm_match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        if not fm_match:
            errors.append("无法解析 SKILL.md 的 frontmatter")
        else:
            fm_text = fm_match.group(1)

            # 检查必填字段
            if not re.search(r"^name:\s*.+$", fm_text, re.MULTILINE):
                errors.append("frontmatter 缺少 'name' 字段")
            if not re.search(r"^description:\s*.+$", fm_text, re.MULTILINE):
                errors.append("frontmatter 缺少 'description' 字段")

            # 检查 name 格式（连字符）
            name_match = re.search(r"^name:\s*(.+)$", fm_text, re.MULTILINE)
            if name_match:
                name = name_match.group(1).strip()
                if not re.match(r"^[a-z0-9-]+$", name):
                    errors.append(f"name 应使用小写连字符格式: {name}")
                if len(name) > 64:
                    errors.append(f"name 长度超过 64 字符: {len(name)}")

        # 检查是否有 markdown 标题在 frontmatter 之前
        lines = content.split("\n")
        in_fm = False
        for line in lines:
            if line.startswith("---"):
                in_fm = True
                continue
            if in_fm and line.startswith("---"):
                in_fm = False
                continue
            if not in_fm and line.startswith("#"):
                errors.append("markdown 标题 (#) 不能出现在 frontmatter 之前")
                break

    except Exception as e:
        errors.append(f"读取 SKILL.md 失败: {e}")

    # 4. 检查 assets 目录（如果声明了）
    if (skill_path / "assets").exists():
        assets_files = list((skill_path / "assets").rglob("*"))
        if not any(f.is_file() for f in assets_files):
            warnings.append("assets 目录存在但为空")

    # 5. 检查是否有可疑的 secrets
    suspicious_patterns = [
        r"api[_-]?key",
        r"secret",
        r"password",
        r"token",
        r"credential"
    ]
    for md_file in skill_path.rglob("*.md"):
        try:
            content = md_file.read_text(encoding="utf-8", errors="ignore").lower()
            for pattern in suspicious_patterns:
                if re.search(pattern, content):
                    warnings.append(f"{md_file.relative_to(skill_path)} 可能包含敏感信息")
                    break
        except:
            pass

    # 输出结果
    if errors:
        print("❌ 验证失败:")
        for e in errors:
            print(f"   - {e}")
        return False

    print("✅ 验证通过!")
    if warnings:
        print("⚠️  警告:")
        for w in warnings:
            print(f"   - {w}")

    return True


if __name__ == "__main__":
    skill_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    success = validate_skill(skill_dir)
    sys.exit(0 if success else 1)
