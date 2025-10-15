const colors = require('./colors/index');

exports.disgust = (userEmotion, userColor) => {
    try {
        return colors[userColor](userEmotion, userColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Disgust', color:'pink'};
    }
}