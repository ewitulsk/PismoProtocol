import os
import argparse
from pathlib import Path


def should_ignore_folder(path, ignore_folders, base_directory):
    """Check if a path should be ignored based on user-provided folders to ignore"""
    # Get relative path from base directory
    rel_path = os.path.relpath(path, base_directory)
    
    # Check each ignore folder
    for folder in ignore_folders:
        if rel_path == folder or rel_path.startswith(folder + os.sep):
            return True
    
    return False


def extract_directory_structure(directory, output_file, ignore_folders):
    """Extract and write directory structure to output file"""
    with open(output_file, 'w') as f:
        f.write(f"Directory Structure for: {directory}\n\n")
        
        for root, dirs, files in os.walk(directory):
            # Filter out directories that should be ignored
            dirs[:] = [d for d in dirs if not d.startswith('.') and 
                      not should_ignore_folder(os.path.join(root, d), ignore_folders, directory)]
            
            # Skip this directory if it should be ignored (but not the root directory itself)
            if should_ignore_folder(root, ignore_folders, directory) and root != directory:
                continue
                
            level = root.replace(directory, '').count(os.sep)
            indent = '    ' * level
            f.write(f"{indent}{os.path.basename(root)}/\n")
            
            sub_indent = '    ' * (level + 1)
            for file in files:
                if not file.startswith('.'):
                    f.write(f"{sub_indent}{file}\n")


def extract_file_contents(directory, output_file, ignore_folders):
    """Extract and append file contents to output file"""
    with open(output_file, 'a') as f:
        f.write("\n\nFile Contents:\n\n")
        
        for root, dirs, files in os.walk(directory):
            # Filter out directories that should be ignored
            dirs[:] = [d for d in dirs if not d.startswith('.') and 
                      not should_ignore_folder(os.path.join(root, d), ignore_folders, directory)]
            
            # Skip this directory if it should be ignored (but not the root directory itself)
            if should_ignore_folder(root, ignore_folders, directory) and root != directory:
                continue
                
            for file in files:
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, directory)
                
                # Skip hidden files
                if file.startswith('.'):
                    continue
                
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='replace') as content_file:
                        content = content_file.read()
                        
                    f.write(f"File: {relative_path}\n")
                    f.write("=" * (len(relative_path) + 6) + "\n")
                    f.write(content)
                    f.write("\n\n" + "=" * 80 + "\n\n")
                except Exception as e:
                    f.write(f"File: {relative_path}\n")
                    f.write("=" * (len(relative_path) + 6) + "\n")
                    f.write(f"Error reading file: {str(e)}\n")
                    f.write("\n\n" + "=" * 80 + "\n\n")


def main():
    parser = argparse.ArgumentParser(description='Extract directory structure and file contents')
    parser.add_argument('directory', help='Directory to process')
    parser.add_argument('--output', default='output.txt', help='Output file (default: output.txt)')
    parser.add_argument('--ignore', nargs='+', default=[], help='Folders to ignore (e.g., node_modules dist)')
    
    args = parser.parse_args()
    
    directory = os.path.abspath(args.directory)
    output_file = args.output
    ignore_folders = args.ignore
    
    if not os.path.isdir(directory):
        print(f"Error: {directory} is not a valid directory")
        return
    
    # If no ignore folders provided, prompt the user
    if not ignore_folders:
        user_input = input("Enter folders to ignore (separated by spaces, e.g., 'node_modules dist'): ")
        ignore_folders = user_input.split()
    
    print(f"Folders that will be ignored: {', '.join(ignore_folders)}")
    print(f"Extracting directory structure and file contents from {directory}...")
    extract_directory_structure(directory, output_file, ignore_folders)
    extract_file_contents(directory, output_file, ignore_folders)
    print(f"Done! Output written to {output_file}")


if __name__ == "__main__":
    main()