const colors = require('./colors/index');

exports.surprised = (userEmotion, userColor) => {
    try {
        return colors[userColor](userEmotion, userColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Surprised', color:'aqua'};
    }
}