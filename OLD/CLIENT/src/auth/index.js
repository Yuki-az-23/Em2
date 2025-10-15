
export const isAuthenticated = () =>{
    if(typeof window === 'undefined'){
        return false;
    }if(localStorage.getItem('jwt')){
        return JSON.parse(localStorage.getItem('jwt'));
    }else{
        return false;
    }
}

export const signout = (next) =>{
    if(typeof window !== 'undefined')localStorage.removeItem('jwt');
    next();
    return fetch(`${process.env.REACT_APP_API_URL}/signout`,{
        method:'GET'
    })
    .then((response) => {
        return response.json();
    })
    .catch(err => console.log(err))
}

