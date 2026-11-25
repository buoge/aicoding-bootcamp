import os
import shutil

def smart_md_organizer():
    # 1. 交互式初始化
    print("--- 📂 文件夹扁平化 + 智能合并/复制工具 ---")
    user_input = input("请输入目标目录路径 (直接回车表示当前目录): ").strip()
    source_dir = os.path.abspath(user_input if user_input else os.getcwd())

    # 路径合法性检查
    if not os.path.exists(source_dir) or not os.path.isdir(source_dir):
        print(f"❌ 错误：路径 '{source_dir}' 不存在。")
        return

    target_dir = os.path.join(source_dir, 'all-in-one')
    script_name = os.path.basename(__file__)

    if not os.path.exists(target_dir):
        os.makedirs(target_dir)

    print(f"🚀 正在处理目录: {source_dir}\n")

    # 2. 分类处理：区分文件夹和单文件
    all_items = os.listdir(source_dir)
    
    for item in all_items:
        item_path = os.path.join(source_dir, item)
        
        # 跳过目标文件夹和脚本自身
        if item == 'all-in-one' or item == script_name or item.startswith('.'):
            continue

        # 情况 A：如果是子文件夹 -> 执行合并逻辑
        if os.path.isdir(item_path):
            output_file_name = f"{item}.md"
            output_path = os.path.join(target_dir, output_file_name)
            combined_content = []
            md_count = 0

            for root, dirs, files in os.walk(item_path):
                for file in sorted(files):
                    if file.lower().endswith('.md'):
                        file_path = os.path.join(root, file)
                        rel_path = os.path.relpath(file_path, item_path)
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                                separator = f"\n\n\n"
                                header = f"\n## 文件预览: {rel_path}\n\n"
                                combined_content.append(separator + header + content)
                                md_count += 1
                        except Exception as e:
                            print(f"❌ 读取失败 {file}: {e}")

            if combined_content:
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(f"# {item} 知识库合集\n\n")
                    f.writelines(combined_content)
                print(f"📦 [合并] 文件夹 '{item}' -> {output_file_name} ({md_count}个文件)")

        # 情况 B：如果是单个 .md 文件 -> 直接复制到 all-in-one
        elif os.path.isfile(item_path) and item.lower().endswith('.md'):
            dst_path = os.path.join(target_dir, item)
            
            # 冲突处理：如果已存在同名合并文件，加后缀防止覆盖
            if os.path.exists(dst_path):
                base, ext = os.path.splitext(item)
                dst_path = os.path.join(target_dir, f"{base}_original{ext}")
            
            try:
                shutil.copy2(item_path, dst_path)
                print(f"📄 [复制] 独立文件: {item}")
            except Exception as e:
                print(f"❌ 复制失败 {item}: {e}")

    print(f"\n✨ 任务完成！合并与复制结果已存放在: {target_dir}")

if __name__ == "__main__":
    smart_md_organizer()