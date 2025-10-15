exports.yellow = (postEmotion, postColor) => { 
  if(postEmotion === 'Feared' && postColor ==='yellow'){
    return{emotion:'Trust', color:'red'};
  }
}