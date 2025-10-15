const colors = require('./colors/index');

exports.trust = (userEmotion, userColor) => {
    try {
        return colors[userColor](userEmotion, userColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Trust', color:'lime'};
    }
}