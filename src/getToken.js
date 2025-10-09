import Cookies from 'js-cookie'

function getToken() {
	const token = Cookies.get('token')
	return token
}

export default getToken()
