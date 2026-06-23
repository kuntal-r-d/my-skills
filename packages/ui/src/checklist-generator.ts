interface Criterion {
  bucket?: string;
  category?: string;
  label?: string;
  passed?: boolean | null;
  value?: unknown;
  explanation?: string;
}

export class ChecklistGenerator {
  static generateMomentumChecklist(data: Record<string, unknown>): string {
    const criteria = (data.criteria ?? []) as Criterion[];
    const score = Number(data.score ?? 0);
    const ticker = String(data.ticker ?? 'Unknown');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Momentum Checklist - ${ticker}</title>
    <style>
        ${ChecklistGenerator.getCss()}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 Momentum Trading Checklist</h1>
            <div class="ticker-info">
                <span class="ticker">${ticker}</span>
                <span class="score">Score: ${(score * 100).toFixed(1)}%</span>
            </div>
        </header>

        <div class="checklist">
            ${ChecklistGenerator.generateCriteriaItems(criteria)}
        </div>

        <footer>
            <p class="disclaimer">Educational analysis only. Not financial advice.</p>
            <p class="timestamp">Generated: ${ChecklistGenerator.formatTimestamp()}</p>
        </footer>
    </div>

    <script>
        ${ChecklistGenerator.getJavascript()}
    </script>
</body>
</html>`;
  }

  static generateInvestmentChecklist(data: Record<string, unknown>): string {
    const criteria = (data.criteria ?? []) as Criterion[];
    const grade = String(data.grade ?? 'N/A');
    const gpa = Number(data.gpa ?? 0);
    const ticker = String(data.ticker ?? 'Unknown');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Investment Checklist - ${ticker}</title>
    <style>
        ${ChecklistGenerator.getCss()}
        .grade-display {
            font-size: 48px;
            font-weight: bold;
            color: ${ChecklistGenerator.gradeColor(grade)};
            text-align: center;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>💰 Value Investment Checklist</h1>
            <div class="ticker-info">
                <span class="ticker">${ticker}</span>
                <div class="grade-display">${grade}</div>
                <span class="gpa">GPA: ${gpa.toFixed(2)}/4.0</span>
            </div>
        </header>

        <div class="checklist">
            ${ChecklistGenerator.generateInvestmentCriteria(criteria)}
        </div>

        <footer>
            <p class="disclaimer">Educational analysis only. Not financial advice.</p>
            <p class="timestamp">Generated: ${ChecklistGenerator.formatTimestamp()}</p>
        </footer>
    </div>

    <script>
        ${ChecklistGenerator.getJavascript()}
    </script>
</body>
</html>`;
  }

  private static generateCriteriaItems(criteria: Criterion[]): string {
    let html = '';
    let currentCategory: string | null = null;

    for (const item of criteria) {
      const category = item.bucket ?? item.category ?? 'Other';
      if (category !== currentCategory) {
        if (currentCategory !== null) {
          html += '</div>';
        }
        html += `<div class="category"><h2>${ChecklistGenerator.titleCase(category)}</h2>`;
        currentCategory = category;
      }

      const passed = item.passed;
      const icon = passed === true ? '✅' : passed === false ? '❌' : '❓';
      const cssClass = passed === true ? 'passed' : passed === false ? 'failed' : 'unknown';

      let value = item.value ?? 'N/A';
      if (typeof value === 'number') {
        value = value.toFixed(2);
      } else if (typeof value === 'object' && value !== null) {
        value = JSON.stringify(value, null, 2);
      }

      html += `
            <div class="criterion ${cssClass}" onclick="toggleExplanation(this)">
                <div class="criterion-header">
                    <span class="icon">${icon}</span>
                    <span class="label">${item.label ?? 'Unknown'}</span>
                    <span class="value">${value}</span>
                </div>
                <div class="explanation" style="display:none;">
                    <p>${item.explanation ?? 'No explanation available.'}</p>
                </div>
            </div>
            `;
    }

    if (currentCategory !== null) {
      html += '</div>';
    }

    return html;
  }

  private static generateInvestmentCriteria(criteria: Criterion[]): string {
    let html = '';
    const categories: Record<string, Criterion[]> = {};

    for (const item of criteria) {
      const category = item.bucket ?? 'Other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category]!.push(item);
    }

    for (const [category, items] of Object.entries(categories)) {
      const passed = items.filter((i) => i.passed).length;
      const total = items.length;

      html += `
            <div class="category">
                <h2>${ChecklistGenerator.titleCase(category)} (${passed}/${total})</h2>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${total ? (passed / total) * 100 : 0}%"></div>
                </div>
            `;

      for (const item of items) {
        const itemPassed = item.passed;
        const icon = itemPassed === true ? '✅' : itemPassed === false ? '❌' : '❓';
        const cssClass = itemPassed === true ? 'passed' : itemPassed === false ? 'failed' : 'unknown';

        html += `
                <div class="criterion ${cssClass}" onclick="toggleExplanation(this)">
                    <div class="criterion-header">
                        <span class="icon">${icon}</span>
                        <span class="label">${item.label ?? 'Unknown'}</span>
                    </div>
                    <div class="explanation" style="display:none;">
                        <p>${item.explanation ?? 'No explanation available.'}</p>
                        <p class="value">Value: ${item.value ?? 'N/A'}</p>
                    </div>
                </div>
                `;
      }

      html += '</div>';
    }

    return html;
  }

  private static getCss(): string {
    return `
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        header {
            background: white;
            border-radius: 10px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        h1 {
            margin: 0 0 20px 0;
            color: #333;
        }
        .ticker-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .ticker {
            font-size: 36px;
            font-weight: bold;
            color: #667eea;
        }
        .score {
            font-size: 24px;
            color: #333;
        }
        .gpa {
            font-size: 20px;
            color: #666;
        }
        .checklist {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .category {
            margin-bottom: 30px;
        }
        .category h2 {
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
        .criterion {
            background: #f8f9fa;
            border-radius: 8px;
            margin-bottom: 10px;
            padding: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .criterion:hover {
            transform: translateX(5px);
            box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        }
        .criterion-header {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .icon {
            font-size: 20px;
        }
        .label {
            flex: 1;
            font-weight: 500;
        }
        .value {
            color: #666;
            font-family: monospace;
        }
        .explanation {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #dee2e6;
            color: #666;
            font-size: 14px;
        }
        .passed {
            border-left: 4px solid #28a745;
        }
        .failed {
            border-left: 4px solid #dc3545;
        }
        .unknown {
            border-left: 4px solid #ffc107;
        }
        .progress-bar {
            height: 10px;
            background: #e9ecef;
            border-radius: 5px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #28a745, #20c997);
            transition: width 0.3s ease;
        }
        footer {
            text-align: center;
            color: white;
            margin-top: 30px;
        }
        .disclaimer {
            font-weight: bold;
            font-size: 14px;
        }
        .timestamp {
            font-size: 12px;
            opacity: 0.8;
        }
        `;
  }

  private static getJavascript(): string {
    return `
        function toggleExplanation(element) {
            const explanation = element.querySelector('.explanation');
            if (explanation) {
                if (explanation.style.display === 'none') {
                    explanation.style.display = 'block';
                } else {
                    explanation.style.display = 'none';
                }
            }
        }
        `;
  }

  private static gradeColor(grade: string): string {
    const gradeColors: Record<string, string> = {
      'A+': '#28a745',
      A: '#28a745',
      'B+': '#20c997',
      B: '#17a2b8',
      C: '#ffc107',
      D: '#fd7e14',
      F: '#dc3545',
    };
    return gradeColors[grade] ?? '#6c757d';
  }

  private static titleCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private static formatTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
}
