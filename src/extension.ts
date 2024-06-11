import * as vscode from "vscode";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand("extension.showCustomSearchResults", async () => {
        createSearchPanel(context);
    });

    context.subscriptions.push(disposable);
}

async function createSearchPanel(context: vscode.ExtensionContext) {
    const searchTerm = await vscode.window.showInputBox({
        prompt: "Enter search term",
    });

    if (!searchTerm) {
        vscode.window.showErrorMessage("Search term cannot be empty.");
        return;
    }

    const panel = vscode.window.createWebviewPanel("searchResults", "Search Results", vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });

    panel.webview.html = getWebviewContent(searchTerm);

    const results = await searchWorkspace(searchTerm);
    console.log("Search results:", results); // 추가된 디버그 메시지
    panel.webview.postMessage({ command: "displayResults", results, searchTerm });

    panel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.command) {
                case "close":
                    panel.dispose();
                    break;
                case "openFile":
                    openFileAtLocation(message.file, message.line);
                    break;
                case "showCode":
                    showCodeAtLocation(message.file, message.line, panel, message.searchTerm);
                    break;
                case "newSearch":
                    const newSearchTerm = message.searchTerm;
                    const newResults = await searchWorkspace(newSearchTerm);
                    panel.webview.postMessage({
                        command: "displayResults",
                        results: newResults,
                        searchTerm: newSearchTerm,
                    });
                    break;
                case "log":
                    console.log(message.message);
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

async function searchWorkspace(query: string) {
    const results: { file: string; line: number; text: string }[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return results;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const files = await vscode.workspace.findFiles("**/*.{ts,js,jsx,tsx,html,css,go}", "**/node_modules/**");
    for (const file of files) {
        const relativeFilePath = path.relative(workspaceRoot, file.fsPath);
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        const lines = text.split("\n");
        lines.forEach((lineText, lineNumber) => {
            if (lineText.includes(query)) {
                results.push({
                    file: relativeFilePath,
                    line: lineNumber + 1,
                    text: lineText.trim(),
                });
            }
        });
    }
    return results;
}
function getWebviewContent(initialSearchTerm: string) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Search Results</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header {
            padding: 10px;
            background-color: var(--vscode-editor-background);
            color: var (--vscode-editor-foreground);
            border-bottom: 1px solid var(--vscode-editorGroup-border);
        }
        .search-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border-bottom: 1px solid var(--vscode-editorGroup-border);
        }
        .search-bar input {
            width: 60%;
            padding: 5px;
            font-size: 14px;
            border: 1px solid var(--vscode-editorGroup-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
        }
        .search-bar button {
            padding: 5px 10px;
            font-size: 14px;
            border: none;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
        }
        .search-bar button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .content {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
        .sidebar-container {
            height: 40%;
            border-bottom: 1px solid var(--vscode-editorGroup-border);
            overflow-y: auto;
            background-color: var(--vscode-sideBar-background);
        }
        .sidebar {
            padding: 10px;
            overflow-y: auto;
            background-color: var(--vscode-sideBar-background);
            height: 100%;
        }
        .main-content {
            height: 60%;
            padding: 20px;
            overflow-y: auto;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .search-result {
            padding: 10px;
            border-bottom: 1px solid var(--vscode-editorGroup-border);
            cursor: pointer;
        }
        .search-result:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .search-result.selected {
            background-color: var(--vscode-editor-selectionBackground);
        }
        .file {
            font-weight: bold;
        }
        .line {
            color: var(--vscode-editorLineNumber-foreground);
        }
        .text {
            color: var(--vscode-editor-foreground);
        }
        pre {
            white-space: pre-wrap;
        }
        mark {
            background-color: var(--vscode-editor-findMatchBackground);
            border-bottom: 1px solid var(--vscode-editor-findMatchBorder);
            color: var(--vscode-editor-selectionForeground);
            font-weight: bold;
        }
        .selected-line mark {
            background-color: var(--vscode-editor-findMatchHighlightBackground) !important;
        }
        .selected-line {
            background-color: var(--vscode-editor-selectionHighlightBackground);
            color: var(--vscode-editor-selectionForeground) !important;
            font-weight: bold;
        }
        .line-numbers-rows > span:before {
            color: var(--vscode-editorLineNumber-foreground);
        }
        code[class*="language-"], pre[class*="language-"] {
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
        }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" integrity="sha512-vswe+cgvic/XBoF1OcM/TeJ2FW0OofqAVdCZiEYkd6dwGXthvkSFWOoGGJgS2CW70VK5dQM5Oh+7ne47s74VTg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js" integrity="sha512-SkmBfuA2hqjzEVpmnMt/LINrjop3GKWqsuLSSB3e7iBmYK7JuWw4ldmmxwD9mdm2IRTTi0OxSAfEGvgEi0i2Kw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.27.0/plugins/line-numbers/prism-line-numbers.min.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.css" rel="stylesheet" />
</head>
<body>
    <div class="header">Search Results</div>
    <div class="search-bar">
        <input type="text" id="searchTerm" value="${initialSearchTerm}" />
        <button onclick="search()">Search</button></br>
        <div id="result-count"></div>
    </div>
    <div class="content">
        <div class="sidebar-container">
            <div class="sidebar" id="results"></div>
        </div>
        <div class="main-content" id="content">
            <div class="header">Code Viewer</div>
            <pre class="line-numbers" style="height: 100%;"><code id="code-block" class="language-"></code></pre>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let clickTimeout;

        function logMessage(message) {
            vscode.postMessage({ command: 'log', message: message });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            logMessage(\`Received message: \${JSON.stringify(message)}\`);

            if (message.command === 'displayResults') {
                const resultsDiv = document.getElementById('results');
                const resultCountDiv = document.getElementById('result-count');
                resultCountDiv.textContent = \`\${message.results.length} results found for '\${message.searchTerm}'\`;
                resultsDiv.innerHTML = '';
                message.results.forEach((result, index) => {
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'search-result';
                    resultDiv.innerHTML = \`<div class="file">\${result.file}</div>
                                           <div class="line">Line: \${result.line}</div>
                                           <div class="text">\${highlightText(result.text, message.searchTerm)}</div>\`;
                    resultDiv.addEventListener('click', () => {
                        clearTimeout(clickTimeout);
                        clickTimeout = setTimeout(() => {
                            clearSelected();
                            resultDiv.classList.add('selected');
                            vscode.postMessage({
                                command: 'showCode',
                                file: result.file,
                                line: result.line,
                                searchTerm: message.searchTerm
                            });
                        }, 300);
                    });
                    resultDiv.addEventListener('dblclick', () => {
                        clearTimeout(clickTimeout);
                        vscode.postMessage({
                            command: 'openFile',
                            file: result.file,
                            line: result.line
                        });
                    });
                    resultsDiv.appendChild(resultDiv);
                    if (index === 0) {
                        resultDiv.classList.add('selected');
                        vscode.postMessage({
                            command: 'showCode',
                            file: result.file,
                            line: result.line,
                            searchTerm: message.searchTerm
                        });
                    }
                });
            } else if (message.command === 'showCode') {
                const contentDiv = document.getElementById('content');
                contentDiv.innerHTML = \`<div class="header">Code Viewer</div>
                <pre class="line-numbers" style="height: 100%;"><code id="code-block" class="language-\${message.lang}">\${message.code}</code></pre>\`;
                Prism.highlightAll();
                highlightTextCodeBlock(message.searchTerm);
                highlightSelectedLine(message.line - message.startLine + 1);  // 상대 라인 번호로 전달
                scrollToSearchTerm(message.searchTerm);
            } else if (message.command === 'noResults') {
                const contentDiv = document.getElementById('content');
                contentDiv.innerHTML = '<div>No results found.</div>';
            }
        });

        function clearSelected() {
            const selected = document.querySelector('.search-result.selected');
            if (selected) {
                selected.classList.remove('selected');
            }
        }

        function search() {
            const searchTerm = document.getElementById('searchTerm').value;
            logMessage(\`Search term: \${searchTerm}\`);
            vscode.postMessage({ command: 'newSearch', searchTerm });
        }

        function highlightTextCodeBlock(searchTerm){
            const codeBlock = document.getElementById('code-block');
            codeBlock.innerHTML = highlightText(codeBlock.innerHTML,searchTerm);
        }

        function highlightText(text, searchTerm) {
            const regex = new RegExp(\`(\${searchTerm})\`, 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        }

        function highlightSelectedLine(relativeLine) {
            const codeBlock = document.getElementById('code-block');
            const lines = codeBlock.innerHTML.split('\\n');
            lines[relativeLine - 1] = \`<span class="selected-line">\${lines[relativeLine - 1]}</span>\`;
            codeBlock.innerHTML = lines.join('\\n');
        }

        function scrollToSearchTerm(searchTerm) {
            const contentDiv = document.getElementById('content');
            const element = contentDiv.querySelector('mark');
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                vscode.postMessage({ command: 'close' });
            }
        });
    </script>
</body>
</html>
`;
}

async function openFileAtLocation(file: string, line: number) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const filePath = path.join(workspaceRoot, file);
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { selection: new vscode.Range(line - 1, 0, line - 1, 0) });
}

async function showCodeAtLocation(file: string, line: number, panel: vscode.WebviewPanel, searchTerm: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const filePath = path.join(workspaceRoot, file);
    try {
        const document = await vscode.workspace.openTextDocument(filePath);
        const text = document.getText();
        const lines = text.split("\n");
        const startLine = Math.max(0, line - 15); // Show up to 15 lines before the search term
        const endLine = Math.min(lines.length, line + 15); // Show up to 15 lines after the search term
        const codeSnippet = lines.slice(startLine, endLine).join("\n");
        console.log(`Showing code snippet from line ${startLine + 1} to ${endLine} for file ${file}`);
        console.log(`Code snippet:\n${codeSnippet}`);
        panel.webview.postMessage({
            command: "showCode",
            code: codeSnippet,
            lang: getLanguageFromFile(filePath),
            searchTerm,
            startLine: startLine + 1, // 줄 번호는 1부터 시작합니다.
            line,
        });
    } catch (error) {
        console.error(`Failed to read file: ${filePath}`, error);
        panel.webview.postMessage({
            command: "showCode",
            code: "",
            lang: getLanguageFromFile(filePath),
            searchTerm,
            startLine: 0,
            line,
        });
    }
}

function getLanguageFromFile(file: string) {
    const extension = file.split(".").pop();
    switch (extension) {
        case "ts":
        case "tsx":
            return "typescript";
        case "js":
            return "javascript";
        case "py":
            return "python";
        case "java":
            return "java";
        case "cs":
            return "csharp";
        case "php":
            return "php";
        case "rb":
            return "ruby";
        case "go":
            return "go";
        default:
            return "markup"; // default language
    }
}

export function deactivate() {}
