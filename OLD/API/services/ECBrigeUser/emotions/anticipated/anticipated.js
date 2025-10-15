const colors = require('./colors/index');

exports.anticipated = (userEmotion, userColor) => {
    try {
        return colors[userColor](userEmotion, userColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Anticipated', color:'orange'};
    }
}