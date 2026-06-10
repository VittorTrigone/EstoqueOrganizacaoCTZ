const url = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';

const detalhes = {
    'grant_type': 'authorization_code',
    'client_id': 'tiny-api-43f8945d266becc75beab50721a7ed425216d7e1-1781022689',
    'client_secret': 'UoIG2stHSq5MEzj64PtzuHAFEpOCwI9j',
    'redirect_uri': 'https://sistemas.emporioctz.com.br',
    'code': 'a8053fc6-0203-47fc-b0ff-925a85cac3d6.0048a8b1-3808-45f0-86f7-68baf5edc3f3.e6990545-e74b-4bb4-97ae-7ac5ec274bb2'
};

let formBody = [];
for (let property in detalhes) {
  let encodedKey = encodeURIComponent(property);
  let encodedValue = encodeURIComponent(detalhes[property]);
  formBody.push(encodedKey + "=" + encodedValue);
}
formBody = formBody.join("&");

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
  },
  body: formBody
})
.then(response => response.json())
.then(data => {
  console.log('Sucesso! Aqui está seu token:', data);
  // data.access_token -> Use para buscar os produtos
  // data.refresh_token -> Guarde para renovar o acesso amanhã
})
.catch(error => console.error('Erro ao pegar o token:', error));