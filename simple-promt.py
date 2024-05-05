# import the necessary libs
import os
import google.generativeai as genai
from dotenv import load_dotenv, dotenv_values 
# loading variables from .env file
load_dotenv() 
KEY = os.environ['API_KEY']
genai.configure(api_key=KEY)
model = genai.GenerativeModel("gemini-pro")

def remove_asterisk(text):
    text = text.replace("*", " ")
    return text

def send_response(image, text):
    response = model.generate_content([image,text])
    return image, text


# print("Type EXIT to close chat\n")
# while True:
#     PROMPT = input("Send a message to Gemini: ")
#     if PROMPT=="EXIT":
#         break
#     response = model.generate_content(PROMPT)
#     print(remove_asterisk(response.text))

# print("Thank you for using this simple chatbot")