function postgresPlaceholders(sql) {
    let parameter = 0;
    let output = '';
    let quote = null;
    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < sql.length; index += 1) {
        const character = sql[index];
        const next = sql[index + 1];

        if (lineComment) {
            output += character;
            if (character === '\n') lineComment = false;
            continue;
        }
        if (blockComment) {
            output += character;
            if (character === '*' && next === '/') {
                output += next;
                index += 1;
                blockComment = false;
            }
            continue;
        }
        if (quote) {
            output += character;
            if (character === quote) {
                if (next === quote) {
                    output += next;
                    index += 1;
                } else {
                    quote = null;
                }
            } else if (character === '\\' && quote === "'" && next) {
                output += next;
                index += 1;
            }
            continue;
        }
        if (character === '-' && next === '-') {
            output += character + next;
            index += 1;
            lineComment = true;
        } else if (character === '/' && next === '*') {
            output += character + next;
            index += 1;
            blockComment = true;
        } else if (character === "'" || character === '"') {
            output += character;
            quote = character;
        } else if (character === '?') {
            parameter += 1;
            output += `$${parameter}`;
        } else {
            output += character;
        }
    }

    return output;
}

module.exports = { postgresPlaceholders };
