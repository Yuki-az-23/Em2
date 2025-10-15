const colors = require('./colors/index');

exports.joy = (userEmotion, userColor) => {
    try {
        return colors[userColor](userEmotion, userColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Joy', color:'yellow'};
    }
}