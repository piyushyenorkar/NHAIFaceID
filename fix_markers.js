const fs = require('fs');

function fixFile(filepath) {
    let content = fs.readFileSync(filepath, 'utf-8');
    
    // Match conflict markers accounting for \r\n
    // Format:
    // <<<<<<< HEAD\r\n
    // (code to discard)
    // =======\r\n
    // (code to keep)
    // >>>>>>> [hash]\r\n
    const pattern = /<<<<<<< HEAD\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>> [a-f0-9]+\r?\n?/g;
    
    const newContent = content.replace(pattern, '$2');
    
    fs.writeFileSync(filepath, newContent, 'utf-8');
    console.log('Fixed ' + filepath);
}

fixFile('NHAIFaceID/src/screens/EnrollScreen.js');
fixFile('NHAIFaceID/src/screens/VerifyScreen.js');
