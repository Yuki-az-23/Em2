const {angry} = require('./emotions/angry/angry');
const {anticipated} = require('./emotions/anticipated/anticipated');
const {disgust} = require('./emotions/disgust/disgust');
const {feared} = require('./emotions/feared/feared');
const {joy} = require('./emotions/joy/joy');
const {sad} = require('./emotions/sad/sad');
const {surprised} = require('./emotions/surprised/surprised');
const {trust} = require('./emotions/trust/trust');





exports.ECBrige2 = (userEmotion, userColor) => {
  try {
    if(userEmotion === 'Angry'){
      return angry(userEmotion, userColor)
    }else if(userEmotion === 'Anticipated'){
      return anticipated(userEmotion, userColor)
    }else if(userEmotion === 'Disgust'){
      return disgust(userEmotion, userColor)
    }else if(userEmotion === 'Feared'){
      return feared(userEmotion, userColor)
    }else if(userEmotion === 'Joy'){
      return joy(userEmotion, userColor)
    }else if(userEmotion === 'Sad'){
      return sad(userEmotion, userColor)
    }else if(userEmotion === 'Surprised'){
      return surprised(userEmotion, userColor)
    }else if(userEmotion === 'Trust'){
      return trust(userEmotion, userColor)
    } 
  }catch (undefined) {
    return{emotion:'Disgust', color:'orange'};
  }         
}

  



