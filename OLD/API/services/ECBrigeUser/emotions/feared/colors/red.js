exports.red = (postEmotion, postColor) => { 
  if(postEmotion === 'Feared' && postColor ==='red'){
    return{emotion:'Sad', color:'pink'};
  }
}